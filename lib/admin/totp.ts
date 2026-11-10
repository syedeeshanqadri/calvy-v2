import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// TOTP (RFC 6238: HMAC-SHA1, 6 digits, 30 s step) for the admin's authenticator app, plus one-time recovery codes.
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const TOTP_STEP_SECONDS = 30;

export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of s.replace(/[\s=-]/g, "").toUpperCase()) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error("not base32");
    value = (value << 5) | i; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export const generateTotpSecret = () => base32Encode(randomBytes(20));

export const totpStep = (nowMs: number) => Math.floor(nowMs / 1000 / TOTP_STEP_SECONDS);

/** The 6-digit code for a time step. */
export function totpAt(secretB32: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const h = createHmac("sha1", base32Decode(secretB32)).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, "0");
}

/**
 * Check a code against the current step and one step either side (clock drift). Returns the step that matched, or
 * null. A step at or before `lastUsedStep` is refused: a code works once.
 */
export function verifyTotp(secretB32: string, code: string, nowMs: number, lastUsedStep: number | null = null): number | null {
  const given = (code ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(given)) return null;
  const now = totpStep(nowMs);
  for (const step of [now, now - 1, now + 1]) {
    if (lastUsedStep !== null && step <= lastUsedStep) continue;
    const a = Buffer.from(totpAt(secretB32, step)), b = Buffer.from(given);
    if (a.length === b.length && timingSafeEqual(a, b)) return step;
  }
  return null;
}

/** The link an authenticator app understands (shown as text; the setup key can also be typed in). */
export function otpauthUri(secretB32: string, accountEmail: string): string {
  return `otpauth://totp/${encodeURIComponent(`Calvy Admin:${accountEmail}`)}?secret=${secretB32}&issuer=${encodeURIComponent("Calvy Admin")}&digits=6&period=${TOTP_STEP_SECONDS}`;
}

/** Eight recovery codes like `k3f9-x2m7`. Only their hashes are stored; the plain codes are shown once. */
export function generateRecoveryCodes(n = 8): string[] {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: n }, () => {
    const bytes = randomBytes(8);
    const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
    return `${chars.slice(0, 4)}-${chars.slice(4)}`;
  });
}

export const normalizeRecoveryCode = (c: string) => c.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
export const hashRecoveryCode = (c: string) => createHash("sha256").update(normalizeRecoveryCode(c)).digest("hex");

/** Index of the matching unused hash, or -1. */
export function findRecoveryCode(hashes: string[], code: string): number {
  const h = hashRecoveryCode(code);
  return hashes.findIndex((x) => x.length === h.length && timingSafeEqual(Buffer.from(x), Buffer.from(h)));
}
