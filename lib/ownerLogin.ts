// Single-use emailed sign-in links for owners. Two kinds:
//   "signin": the login page's "Email me a sign-in link". Lives 15 minutes; asking for a new one cancels the old.
//   "resume": the link in an onboarding reminder. Lives 7 days and opens the owner's onboarding where they stopped.
// Only a hash is stored. Using a link is one atomic write, so two requests with the same link cannot both get in. Using it also proves the
// address (the link went to that mailbox), which is handled by the caller (lib/ownerTakeover.ts).
import type { Prisma, PrismaClient } from "@prisma/client";
import { generateToken, hashToken, tokenExpiry } from "@/lib/auth-tokens";

type Db = PrismaClient | Prisma.TransactionClient;
export type LoginPurpose = "signin" | "resume";
export const SIGNIN_LINK_TTL_MS = 15 * 60_000;
export const RESUME_LINK_TTL_MS = 7 * 24 * 3_600_000;

export async function issueOwnerLoginToken(db: Db, userId: string, purpose: LoginPurpose, step?: number | null, now = new Date()): Promise<string> {
  const token = generateToken();
  if (purpose === "signin") await db.ownerLoginToken.deleteMany({ where: { userId, purpose: "signin", usedAt: null } });
  await db.ownerLoginToken.create({
    data: { userId, purpose, step: step ?? null, tokenHash: hashToken(token), expiresAt: tokenExpiry(purpose === "signin" ? SIGNIN_LINK_TTL_MS : RESUME_LINK_TTL_MS, now) },
  });
  return token;
}

/** Spend a link. Returns who it was for, or null when it is unknown, already used or expired. */
export async function redeemOwnerLoginToken(db: Db, rawToken: string | undefined | null, now = new Date()): Promise<{ userId: string; purpose: LoginPurpose; step: number | null } | null> {
  if (!rawToken || !/^[0-9a-f]{64}$/.test(rawToken)) return null;
  const tokenHash = hashToken(rawToken);
  const claimed = await db.ownerLoginToken.updateMany({ where: { tokenHash, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
  if (claimed.count !== 1) return null;
  const rec = await db.ownerLoginToken.findUnique({ where: { tokenHash }, select: { userId: true, purpose: true, step: true } });
  return rec ? { userId: rec.userId, purpose: rec.purpose === "resume" ? "resume" : "signin", step: rec.step } : null;
}
