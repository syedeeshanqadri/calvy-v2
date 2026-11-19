import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { createBusinessForUser } from "@/lib/createBusiness";
import { sendFormNotification } from "@/lib/email";
import { logger } from "@/lib/logger";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { parseRefCookie } from "@/lib/calvyBadge";
import { parseBody } from "@/lib/validation/common";
import { signupSchema } from "@/lib/validation/public";
import { detectRegion, detectCountry, currencyFor } from "@/lib/onboarding";
import { verifyTurnstile } from "@/lib/turnstile";
import { upsertSignupLead } from "@/lib/leads";
import { signTicket } from "@/lib/signedTicket";
import { SIGNUP_TICKET_PURPOSE, SIGNUP_TICKET_TTL_MS } from "@/lib/signupTicket";

export const dynamic = 'force-dynamic';

/**
 * Passwordless sign-up with no email step: name, business name, email, phone (India). The owner is signed in at once with a one-time ticket and goes
 * straight into onboarding; the email stays unverified until they use a link (the "set your password" email sent when onboarding finishes, a sign-in
 * link, or Google). An invisible Turnstile check and the rate limit stand in front of it.
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
  const { name, businessName, email, phone, timezone, turnstileToken } = parsed.data;
  const bot = await verifyTurnstile(turnstileToken, ip);
  if (!bot.ok) return NextResponse.json({ error: "We could not confirm you are not a robot. Please reload the page and try again." }, { status: 400 });
  const region = detectRegion(timezone);
  const country = detectCountry(timezone);

  const existing = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists. Sign in with Google, or choose \"Email me a sign-in link\" on the sign-in page." }, { status: 409 });
  }

  // Came from a business's "Bookings by Calvy" link? The cookie (set by components/RefCapture) says which site; first touch wins.
  const referral = parseRefCookie(req.cookies.get("calvy_ref")?.value);
  const user = await prisma.user.create({ data: { name, email, ...(referral ? { signupRef: referral.ref, signupSource: referral.source } : {}) } }); // no password yet, email not verified yet
  await createBusinessForUser({
    ownerId: user.id,
    ownerName: name,
    ownerEmail: email,
    businessName,
    currency: currencyFor(region, country),
    region,
    timezone,
    phone,
    onboardingStep: 1, // the business type is asked first (the pack is OTHER until then)
    welcome: false,
  });

  // A lead for the team (Admin → Leads), so an owner who never finishes onboarding is not lost. The reminders and the "set your password" email follow
  // from onboarding state, not from here.
  await upsertSignupLead(prisma, { id: user.id, name, email }, { phone: phone ?? null, step: 1 }).catch((err) => logger.error("[signup] lead not saved", { err }));

  after(() => sendFormNotification({
    title: "New signup",
    fields: { Name: name, Email: email, Phone: phone ?? "-", Business: businessName, Region: region },
  }));

  const secret = process.env.NEXTAUTH_SECRET ?? "";
  return NextResponse.json(
    {
      message: "Account created.",
      ticket: signTicket(SIGNUP_TICKET_PURPOSE, user.id, secret, SIGNUP_TICKET_TTL_MS),
    },
    { status: 201 },
  );
}

export const POST = safeRoute(POST_handler);
