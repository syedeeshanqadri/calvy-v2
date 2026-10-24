// Pending online payments hold a slot or token for a short time (pure helpers + query fragments).
// Rules: docs/steps-3-5-design.md "Pending + hold" and "Refunds".

/**
 * How long a pending payment holds its slot/token. The design asked for 10 minutes, but Cashfree
 * rejects an order expiry of 15 minutes or less (checked against the sandbox). The order expiry
 * is set to the hold expiry, so a customer can never pay after the hold has lapsed; 16 leaves a
 * minute for the request to reach Cashfree.
 */
export const HOLD_MINUTES = 16;

export const PENDING_PAYMENT = "pending_payment";
export const EXPIRED = "expired";

/** Statuses that never occupy a slot. */
export const RELEASED_STATUSES = ["cancelled", "no-show", EXPIRED];

export function holdExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + HOLD_MINUTES * 60_000);
}

/** Does this appointment take capacity right now? A pending payment only while its hold is live. */
export function occupiesSlot(a: { status: string; holdExpiresAt: Date | null }, now: Date = new Date()): boolean {
  if (RELEASED_STATUSES.includes(a.status)) return false;
  if (a.status === PENDING_PAYMENT) return !!a.holdExpiresAt && a.holdExpiresAt.getTime() > now.getTime();
  return true;
}

/**
 * Prisma `where` fragment matching appointments that occupy capacity at `now` (same rule as
 * occupiesSlot). Expired holds are released lazily here, before the cron sweep marks them.
 * A pending payment always has holdExpiresAt set.
 */
export function occupyingWhere(now: Date = new Date()) {
  return {
    status: { notIn: RELEASED_STATUSES },
    NOT: { status: PENDING_PAYMENT, holdExpiresAt: { lte: now } },
  };
}

export type PaidAction = "confirm" | "refund" | "noop";

/**
 * What to do when a payment for this appointment succeeds: confirm a live hold, refund when the
 * hold already lapsed (or the booking was cancelled meanwhile), nothing when already confirmed.
 */
export function onPaid(a: { status: string; holdExpiresAt: Date | null }, now: Date = new Date()): PaidAction {
  if (a.status === PENDING_PAYMENT) return occupiesSlot(a, now) ? "confirm" : "refund";
  if (a.status === EXPIRED || a.status === "cancelled") return "refund";
  return "noop";
}

/**
 * What happens to the money when a paid booking is cancelled (minor units). Owner decision
 * 2026-10-25: the business cancelling refunds everything, platform fee included; the customer
 * cancelling refunds nothing and the whole amount paid (fee, and the service price in
 * FULL_ONLINE) becomes credit on the customer's account for their next booking.
 */
export function settleCancellation(p: { by: "business" | "customer"; paidMinor: number }): { refundMinor: number; creditMinor: number } {
  return p.by === "business" ? { refundMinor: p.paidMinor, creditMinor: 0 } : { refundMinor: 0, creditMinor: p.paidMinor };
}

/** True when `now` is at least `cutoffHours` before the appointment (0 = always before). */
export function beforeCancellationCutoff(start: Date, cutoffHours: number, now: Date = new Date()): boolean {
  return start.getTime() - now.getTime() >= cutoffHours * 3_600_000;
}
