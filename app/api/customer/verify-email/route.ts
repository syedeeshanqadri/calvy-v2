import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import bcrypt from "bcryptjs";
import { hashToken } from "@/lib/auth-tokens";
import { customerVerifySchema } from "@/lib/validation/customer";
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

  const rec = await prisma.customerToken.findUnique({ where: { tokenHash: hashToken(parsed.data.token) }, select: { purpose: true, customer: { select: { password: true } } } });
  if (!rec || rec.purpose !== "verify" || !(await bcrypt.compare(parsed.data.password, rec.customer.password))) {
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
