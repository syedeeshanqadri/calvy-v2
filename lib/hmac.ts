import { createHmac, timingSafeEqual } from "crypto";

/** Does `signature` (hex) match the HMAC-SHA256 of `rawBody` under `secret`? Constant time, never throws. */
export function hmacSha256Matches(rawBody: string, signature: string, secret: string): boolean {
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const given = Buffer.from(signature.trim(), "hex");
  // Buffer.from(hex) stops at the first bad character, so a wrong-length result is simply a mismatch.
  return given.length === expected.length && timingSafeEqual(given, expected);
}
