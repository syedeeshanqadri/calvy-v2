import crypto from "crypto";

export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
export const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Random 32-byte token, hex encoded (64 chars). Only the hash is stored. */
export function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function tokenExpiry(ttlMs: number, now: Date = new Date()): Date {
  return new Date(now.getTime() + ttlMs);
}

export function createResetToken(now: Date = new Date()) {
  const token = generateToken();
  return { token, tokenHash: hashToken(token), expiresAt: tokenExpiry(RESET_TOKEN_TTL_MS, now) };
}

export function isExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime();
}

/** True when a stored reset token record can still be redeemed. */
export function isUsableResetToken(
  rec: { expiresAt: Date; usedAt: Date | null } | null | undefined,
  now: Date = new Date(),
): boolean {
  return !!rec && rec.usedAt === null && !isExpired(rec.expiresAt, now);
}

/** Constant-time comparison of a presented token against a stored hash. */
export function verifyToken(token: string, storedHash: string): boolean {
  const a = Buffer.from(hashToken(token), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
