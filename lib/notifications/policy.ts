/** Pure rules of the outbox: retry timing, error classes and the idempotency key. */

export type NotifChannelName = "EMAIL" | "WHATSAPP";

/** Delay after each failed attempt: 1m, 5m, 30m, 2h, 6h. The attempt after that is the last. */
const BACKOFF_MS = [60_000, 300_000, 1_800_000, 7_200_000, 21_600_000];
export const MAX_ATTEMPTS = BACKOFF_MS.length + 1;

/** When to try again after failed attempt number `attempts` (1-based); null means give up. */
export function nextAttemptAt(attempts: number, now: Date): Date | null {
  if (attempts >= MAX_ATTEMPTS) return null;
  return new Date(now.getTime() + BACKOFF_MS[Math.max(0, attempts - 1)]);
}

/**
 * A provider error we can fix by waiting. Other 4xx mean the message itself is bad, so it fails at once.
 * 409 is retried: Resend uses it for a concurrent request with the same idempotency key.
 */
export function isRetryableStatus(status: number | null | undefined): boolean {
  if (status === null || status === undefined) return true;
  if (status === 408 || status === 409 || status === 429) return true;
  return status >= 500 || status < 400;
}

export function normalizeRecipient(channel: NotifChannelName, recipient: string): string {
  const value = recipient.trim();
  return channel === "EMAIL" ? value.toLowerCase() : value.replace(/\D/g, "");
}

/**
 * Same event + subject + version + recipient + channel = one message, however often it fires.
 * `version` separates real repeats of an event on one subject: the new time, status or reminder lead.
 */
export function idempotencyKey(k: { event: string; subjectId: string; version?: string | number; recipient: string; channel: NotifChannelName }): string {
  return [k.event, k.subjectId, k.version ?? "", normalizeRecipient(k.channel, k.recipient), k.channel].join(":");
}
