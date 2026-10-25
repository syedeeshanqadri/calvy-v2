import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { customerResetSchema } from "@/lib/validation/customer";
import { readJsonBody, parseWith, tooManyRequests } from "@/lib/auth-http";
import { redeemCustomerToken } from "@/lib/customerDb";

export const dynamic = "force-dynamic";

const INVALID = "This reset link is invalid or has expired.";
const invalid = () => NextResponse.json({ error: INVALID }, { status: 400 });

async function POST_handler(req: NextRequest) {
  const rl = await rateLimit(`customer-reset:ip:${clientIp(req)}`, 10, 15 * 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const body = await readJsonBody(req);
  if (!body.ok) return body.res;
  const parsed = parseWith(customerResetSchema, body.data);
  if (!parsed.ok) return parsed.paths.includes("token") ? invalid() : parsed.res;
  const { token, password } = parsed.data;

  const hashed = await bcrypt.hash(password, 12);
  const now = new Date();
  const done = await prisma.$transaction(async (tx) => {
    const id = await redeemCustomerToken(tx, token, "reset", now);
    if (!id) return false;
    // Following the emailed link proves the address, so it also verifies it (as the owner reset does).
    await tx.customer.update({ where: { id }, data: { password: hashed, passwordChangedAt: now, emailVerified: now } });
    await tx.customerToken.deleteMany({ where: { customerId: id, purpose: "reset", usedAt: null } });
    return true;
  });
  if (!done) return invalid();
  return NextResponse.json({ ok: true });
}

export const POST = safeRoute(POST_handler);
