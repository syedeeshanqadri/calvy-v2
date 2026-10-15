import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { createBusinessForUser } from "@/lib/createBusiness";
import { sendVerificationEmail } from "@/lib/email";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { parseBody } from "@/lib/validation/common";
import { signupSchema } from "@/lib/validation/public";

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
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
  const { name, businessName, email, password, currency, timezone } = parsed.data;

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
    currency,
    timezone,
  });

  // Create a 24-hour verification token
  const token = crypto.randomBytes(32).toString("hex");
  await prisma.verificationToken.create({
    data: { token, email: user.email, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
  });

  // Send verification email (non-blocking)
  sendVerificationEmail({ to: email, name, token });

  return NextResponse.json({ message: "Account created. Please check your email to verify." }, { status: 201 });
}
