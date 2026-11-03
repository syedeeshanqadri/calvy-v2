import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { createBusinessForUser } from "@/lib/createBusiness";
import { sendFormNotification } from "@/lib/email";
import { notify } from "@/lib/notifications/enqueue";
import { authEmail } from "@/lib/notifications/events";
import { logger } from "@/lib/logger";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { parseBody } from "@/lib/validation/common";
import { signupSchema } from "@/lib/validation/public";
import { detectRegion, currencyFor } from "@/lib/onboarding";
import { testTokenHookEnabled } from "@/lib/auth-http";
import { createSetupToken } from "@/lib/auth-tokens";
import { signTicket } from "@/lib/signedTicket";
import { SIGNUP_TICKET_PURPOSE, SIGNUP_TICKET_TTL_MS } from "@/lib/signupTicket";

export const dynamic = 'force-dynamic';

/**
 * Passwordless sign-up: name, email, phone (India), business type. The owner goes straight into the onboarding
 * wizard with a one-time sign-in ticket; the email carries the link that verifies the address and sets the password.
 */
async function POST_handler(req: NextRequest) {
  const ip = clientIp(req);
  const rl = await rateLimit(`signup:${ip}`, 5, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many signup attempts. Please try again in a minute." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  const parsed = await parseBody(req, signupSchema);
  if (!parsed.ok) return parsed.res;
  const { name, email, phone, packId, timezone } = parsed.data;
  const region = detectRegion(timezone);

  const existing = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists. Try signing in, or use Forgot password." }, { status: 409 });
  }

  const user = await prisma.user.create({ data: { name, email } }); // no password yet, email not verified yet
  await createBusinessForUser({
    ownerId: user.id,
    ownerName: name,
    ownerEmail: email,
    businessName: `${name.split(/\s+/)[0]}'s Business`,
    currency: currencyFor(region),
    region,
    timezone,
    packId,
    phone,
    onboardingStep: 3, // region and type are already known
    welcome: false,
  });

  // The email: verify the address and choose a password, in one step.
  const { token, tokenHash, expiresAt } = createSetupToken();
  await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash, expiresAt } });
  try {
    await notify(authEmail({ template: "owner_account_setup", userId: user.id, to: email, name, token }));
  } catch (err) {
    logger.error("[signup] setup email not queued", { err });
  }

  after(() => sendFormNotification({
    title: "New signup",
    fields: { Name: name, Email: email, Phone: phone ?? "-", Type: packId, Region: region },
  }));

  const secret = process.env.NEXTAUTH_SECRET ?? "";
  return NextResponse.json(
    {
      message: "Account created. Check your email to verify it and set your password.",
      ticket: signTicket(SIGNUP_TICKET_PURPOSE, user.id, secret, SIGNUP_TICKET_TTL_MS),
      ...(testTokenHookEnabled() ? { devToken: token } : {}),
    },
    { status: 201 },
  );
}

export const POST = safeRoute(POST_handler);
