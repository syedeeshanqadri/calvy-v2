import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";

/**
 * The key behind everything signed or encrypted here. NOTIFY_SECRET_KEY when set; otherwise derived from
 * NEXTAUTH_SECRET, which every deployment has, so reset and verify emails never depend on one more variable.
 * Changing the key only breaks messages still waiting in the outbox (their links expire within a day anyway).
 */
function masterKey(): Buffer {
  const own = process.env.NOTIFY_SECRET_KEY;
  if (own) return createHash("sha256").update(own).digest();
  const fallback = process.env.NEXTAUTH_SECRET;
  if (!fallback) throw new Error("NOTIFY_SECRET_KEY is not set");
  return createHash("sha256").update(`calvy-notify:${fallback}`).digest();
}

/** AES-256-GCM for the one secret value a queued message may carry (a reset or verify link). */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((b) => b.toString("base64url")).join(".");
}

export function decryptSecret(stored: string): string {
  const [iv, tag, body] = stored.split(".").map((p) => Buffer.from(p, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", masterKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
}

/** HMAC for signed links, separated by `purpose` so a signature for one use is worthless for another. */
export function sign(purpose: string, value: string): string {
  return createHmac("sha256", masterKey()).update(`${purpose}|${value}`).digest("base64url");
}

export function verifySignature(purpose: string, value: string, signature: string): boolean {
  const expected = Buffer.from(sign(purpose, value));
  const given = Buffer.from(signature);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
