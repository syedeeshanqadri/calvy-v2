// Rewards rules (pure, no database). Every `every` attended days earns one free Rs 10 confirmation.
// Attended = the booking was marked completed. Cancelled, not-attended, pending and walk-in bookings never count, and
// several attended bookings on the same (business-local) day count once. Rewards never expire.

export const LOYALTY_KEY = "LOYALTY_EVERY_8TH";
export const DEFAULT_EVERY = 7;

/** Who the tally belongs to: the customer account's email, else the phone number (digits only). Null when neither is known. */
export function identityKey(c: { email?: string | null; phone?: string | null }): string | null {
  const email = (c.email ?? "").trim().toLowerCase();
  if (email) return `e:${email}`;
  const digits = (c.phone ?? "").replace(/\D/g, "");
  // A phone number too short to be real would let strangers share one tally.
  return digits.length >= 7 ? `p:${digits}` : null;
}

export interface Tally { counted: number; earned: number; used: number; /** Free confirmations granted by referrals (never expire, spent like earned ones). */ bonus?: number }

export function earnedFor(counted: number, every: number): number {
  return every > 0 ? Math.floor(Math.max(0, counted) / every) : 0;
}

/** One more attended day. */
export function addDay(t: Tally, every: number): Tally {
  const counted = t.counted + 1;
  return { counted, earned: earnedFor(counted, every), used: t.used };
}

export function availableRewards(t: Tally): number {
  return Math.max(0, t.earned + (t.bonus ?? 0) - t.used);
}

export interface ProgressView {
  /** Attended days toward the next reward, 0 to every-1 (shown as "x of 7"). */
  done: number;
  of: number;
  /** Free confirmations ready to use. */
  available: number;
}

export function progressView(t: Tally, every: number): ProgressView {
  return { done: every > 0 ? t.counted % every : 0, of: every, available: availableRewards(t) };
}

/** "3 of 7 visits toward a free booking", or "Free booking ready" when one is waiting. */
export function progressLabel(v: ProgressView): string {
  if (v.available > 0) return v.available === 1 ? "A free booking is ready" : `${v.available} free bookings are ready`;
  return `${v.done} of ${v.of} visits toward a free booking`;
}

/** Counts only a completed, non-walk-in booking. */
export function countsTowardReward(a: { status: string; source: string }): boolean {
  return a.status === "completed" && a.source !== "WALK_IN";
}

/** A reward only waives Calvy's own confirmation fee: the booking must be one that would charge it. */
export function rewardApplies(charge: { route: string; chargeMinor: number; platformFeeMinor: number }): boolean {
  return charge.route === "CALVY" && charge.chargeMinor > 0 && charge.platformFeeMinor > 0;
}
