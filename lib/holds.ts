// Pending online payments hold a slot or token for a short time (pure helpers + query fragments).
// Rules: docs/steps-3-5-design.md "Pending + hold" and "Refunds".
import type { OnlinePayMode } from "@/lib/fees";

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
 * Refund owed when a paid booking is cancelled (minor units).
 * Business cancels: everything back, platform fee included. Customer cancels: the platform fee is
 * kept; with FULL_ONLINE the service share is refunded only before the cancellation cutoff.
 */
export function refundOnCancel(p: {
  by: "business" | "customer";
  mode: OnlinePayMode;
  paidMinor: number;
  platformFeeMinor: number;
  beforeCutoff: boolean;
}): number {
  if (p.by === "business") return p.paidMinor;
  if (p.mode === "BOOKING_FEE_ONLY" || !p.beforeCutoff) return 0;
  return Math.max(0, p.paidMinor - p.platformFeeMinor);
}

/** True when `now` is at least `cutoffHours` before the appointment (0 = always before). */
export function beforeCancellationCutoff(start: Date, cutoffHours: number, now: Date = new Date()): boolean {
  return start.getTime() - now.getTime() >= cutoffHours * 3_600_000;
}
