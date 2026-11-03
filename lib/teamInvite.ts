// Team invites: random token, only its SHA-256 is stored, single use, 48h expiry, resend/revoke.
import { generateToken, hashToken, tokenExpiry, isExpired } from "@/lib/auth-tokens";

export const INVITE_TTL_MS = 48 * 60 * 60 * 1000;

export function createInviteToken(now: Date = new Date()) {
  const token = generateToken();
  return { token, tokenHash: hashToken(token), expiresAt: tokenExpiry(INVITE_TTL_MS, now) };
}

/** Redeemable only when never used, not revoked and not past its expiry. */
export function isUsableInvite(
  rec: { expiresAt: Date; usedAt: Date | null; revokedAt: Date | null } | null | undefined,
  now: Date = new Date(),
): boolean {
  return !!rec && rec.usedAt === null && rec.revokedAt === null && !isExpired(rec.expiresAt, now);
}
