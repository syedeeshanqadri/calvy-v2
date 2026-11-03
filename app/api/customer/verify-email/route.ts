import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import bcrypt from "bcryptjs";
import { hashToken } from "@/lib/auth-tokens";
import { customerSetupSchema, customerVerifySchema } from "@/lib/validation/customer";
import { readJsonBody, parseWith, tooManyRequests } from "@/lib/auth-http";
import { redeemCustomerToken } from "@/lib/customerDb";

export const dynamic = "force-dynamic";

const INVALID = "This verification link is invalid or has expired.";
const INVALID_PASSWORD = "That link or password is not right. Use the password you chose when you signed up, or reset it with Forgot password.";

// Needs the signup password too: someone could sign up with another person's email and a password only
// they know, and the real owner clicking the emailed link must not end up verifying THEIR account.
// A wrong password does not use up the link.
// A POST (from the /my/verify-email page), not a GET: mail scanners that open links must not be able
// to use up or complete a verification.
async function POST_handler(req: NextRequest) {
  const rl = await rateLimit(`customer-verify:ip:${clientIp(req)}`, 10, 15 * 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const body = await readJsonBody(req);
  if (!body.ok) return body.res;
  const parsed = parseWith(customerVerifySchema, body.data);
  if (!parsed.ok) return NextResponse.json({ error: INVALID }, { status: 400 });

  const rec = await prisma.customerToken.findUnique({ where: { tokenHash: hashToken(parsed.data.token) }, select: { purpose: true, customer: { select: { password: true, email: true } } } });
  if (!rec || rec.purpose !== "verify") return NextResponse.json({ error: INVALID }, { status: 400 });

  // An account made at booking has no password yet: whoever holds the emailed link owns the address,
  // so they choose the first password here, and that verifies the email too.
  if (!rec.customer.password) {
    const setup = customerSetupSchema.safeParse(parsed.data);
    if (!setup.success) return NextResponse.json({ error: setup.error.issues[0]?.message ?? "Please choose a password of at least 8 characters." }, { status: 400 });
    const hashed = await bcrypt.hash(setup.data.password, 12);
    const now = new Date();
    const done = await prisma.$transaction(async (tx) => {
      const id = await redeemCustomerToken(tx, parsed.data.token, "verify", now);
      if (!id) return false;
      // Guarded: if a password was set in the meantime (signup), this link no longer sets one.
      const set = await tx.customer.updateMany({ where: { id, password: null }, data: { password: hashed, passwordChangedAt: now, emailVerified: now } });
      return set.count === 1;
    });
    if (!done) return NextResponse.json({ error: INVALID }, { status: 400 });
    return NextResponse.json({ ok: true, setup: true, email: rec.customer.email });
  }

  if (!(await bcrypt.compare(parsed.data.password, rec.customer.password))) {
    return NextResponse.json({ error: INVALID_PASSWORD }, { status: 400 });
  }

  const done = await prisma.$transaction(async (tx) => {
    const id = await redeemCustomerToken(tx, parsed.data.token, "verify");
    if (!id) return false;
    await tx.customer.update({ where: { id }, data: { emailVerified: new Date() } });
    return true;
  });
  if (!done) return NextResponse.json({ error: INVALID }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export const POST = safeRoute(POST_handler);
