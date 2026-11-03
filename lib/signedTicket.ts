import crypto from "crypto";

/** Short-lived HMAC-signed `userId.expiry.signature` tokens. The purpose is part of the signature, so one kind can never be used as another. */
function mac(purpose: string, payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(`${purpose}:${payload}`).digest("hex");
}

export function signTicket(purpose: string, userId: string, secret: string, ttlMs: number, now = Date.now()): string {
  const payload = `${userId}.${now + ttlMs}`;
  return `${payload}.${mac(purpose, payload, secret)}`;
}

export function verifyTicket(purpose: string, value: string | undefined | null, secret: string, now = Date.now()): string | null {
  if (!value || !secret) return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [userId, exp, sig] = parts;
  const a = Buffer.from(sig), b = Buffer.from(mac(purpose, `${userId}.${exp}`, secret));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return Number(exp) > now ? userId : null;
}
