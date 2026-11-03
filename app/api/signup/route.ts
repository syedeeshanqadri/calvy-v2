import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { createBusinessForUser } from "@/lib/createBusiness";
import { sendFormNotification } from "@/lib/email";
import { notify } from "@/lib/notifications/enqueue";
import { authEmail } from "@/lib/notifications/events";
import { logger } from "@/lib/logger";
import { after } from "next/server";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { parseBody } from "@/lib/validation/common";
import { signupSchema } from "@/lib/validation/public";
import { detectRegion, currencyFor } from "@/lib/onboarding";
import { testTokenHookEnabled } from "@/lib/auth-http";

export const dynamic = 'force-dynamic';

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
  const { name, email, password, timezone } = parsed.data;
  const region = detectRegion(timezone);
  const businessName = parsed.data.businessName || `${name.split(/\s+/)[0]}'s Business`;

  const existing = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
  }

  const hashed = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: { name, email, password: hashed },
  });
  await createBusinessForUser({
    ownerId: user.id,
    ownerName: name,
    ownerEmail: email,
    businessName,
    currency: currencyFor(region),
    region,
    timezone,
  });

  // Create a 24-hour verification token
  const token = crypto.randomBytes(32).toString("hex");
  await prisma.verificationToken.create({
    data: { token, email: user.email, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
  });

  // Tell the owner (never includes the password or tokens).
  after(() => sendFormNotification({
    title: "New signup",
    fields: { Name: name, Business: businessName, Email: email, Region: region },
  }));

  // Queue the verification email. A failure here must not fail the signup: the user can ask for another link.
  try {
    await notify(authEmail({ template: "verification", userId: user.id, to: email, name, token }));
  } catch (err) {
    logger.error("[signup] verification email not queued", { err });
  }

  return NextResponse.json({ message: "Account created. Please check your email to verify.", ...(testTokenHookEnabled() ? { devToken: token } : {}) }, { status: 201 });
}

export const POST = safeRoute(POST_handler);
