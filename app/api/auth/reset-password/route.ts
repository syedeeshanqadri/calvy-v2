import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { resetPasswordSchema } from "@/lib/validation/auth";
import { hashToken, isUsableResetToken } from "@/lib/auth-tokens";
import { readJsonBody, parseWith, tooManyRequests } from "@/lib/auth-http";

export const dynamic = "force-dynamic";

const INVALID = "This reset link is invalid or has expired.";
const invalid = () => NextResponse.json({ error: INVALID }, { status: 400 });

export async function POST(req: NextRequest) {
  const rl = await rateLimit(`reset:ip:${clientIp(req)}`, 10, 15 * 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const body = await readJsonBody(req);
  if (!body.ok) return body.res;
  const parsed = parseWith(resetPasswordSchema, body.data);
  if (!parsed.ok) {
    // A malformed token gets the same message as an unknown one.
    return parsed.paths.includes("token") ? invalid() : parsed.res;
  }
  const { token, password } = parsed.data;

  const rec = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!rec || !isUsableResetToken(rec)) return invalid();

  const hashed = await bcrypt.hash(password, 12);
  const now = new Date();

  // Claim the token atomically so a concurrent second use fails.
  const done = await prisma.$transaction(async (tx) => {
    const claimed = await tx.passwordResetToken.updateMany({
      where: { id: rec.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) return false;
    await tx.user.update({ where: { id: rec.userId }, data: { password: hashed, passwordChangedAt: now } });
    await tx.user.updateMany({ where: { id: rec.userId, emailVerified: null }, data: { emailVerified: now } });
    await tx.passwordResetToken.deleteMany({ where: { userId: rec.userId, id: { not: rec.id } } });
    return true;
  });
  if (!done) return invalid();

  return NextResponse.json({ ok: true });
}
