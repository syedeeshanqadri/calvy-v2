import { createHmac, timingSafeEqual } from "crypto";

/** Meta signs the raw request body: `X-Hub-Signature-256: sha256=<hex hmac with the app secret>`. */
export function verifyMetaSignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header || !appSecret || !header.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex"));
  const given = Buffer.from(header.slice("sha256=".length));
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Last four characters only: enough to recognise a value, useless to anyone else. */
export function maskSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.length <= 8 ? "••••" : `••••••••${value.slice(-4)}`;
}

const STOP_WORDS = new Set(["stop", "unsubscribe", "stop all", "cancel subscription", "optout", "opt out", "रोकें", "बंद"]);

/** An inbound text that means "no more messages". Exact match after trimming, so "don't stop by" is not an opt-out. */
export function isStopMessage(text: string | null | undefined): boolean {
  if (!text) return false;
  return STOP_WORDS.has(text.trim().toLowerCase().replace(/[.!]+$/, ""));
}
