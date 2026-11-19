// Rewards ladder, referral and comeback rules (pure, no database). They sit on top of the attended-day tally in ./rules.ts.
//  - Tiers count attended DAYS (the same days the 7-day stamp counts): Regular at 3, Silver at 10, Gold at 25.
//  - Silver: a reschedule keeps the Rs 10 confirmation and never charges again (a perk shown here; the reschedule flow never creates a charge).
//  - Gold: ONE extra free Rs 10 per calendar quarter, which expires at quarter end. (Waitlist priority is skipped: there is no waitlist yet.)
//  - Comeback: +1 stamp when an attended day is within 30 days of the previous attended day.
//  - Referral: the friend must be NEW; both get a free Rs 10 after the friend's first ATTENDED visit; at most 5 rewarded referrals per referrer per month.

export type TierId = "NONE" | "REGULAR" | "SILVER" | "GOLD";
export const TIERS: readonly { id: Exclude<TierId, "NONE">; label: string; min: number; perks: string[] }[] = [
  { id: "REGULAR", label: "Regular", min: 3, perks: [] },
  { id: "SILVER", label: "Silver", min: 10, perks: ["Free reschedule: moving a booking keeps your Rs 10 confirmation"] },
  { id: "GOLD", label: "Gold", min: 25, perks: ["Free reschedule", "One extra free Rs 10 confirmation every quarter"] },
];

export function tierFor(attendedDays: number): TierId {
  const n = Math.max(0, attendedDays);
  let t: TierId = "NONE";
  for (const tier of TIERS) if (n >= tier.min) t = tier.id;
  return t;
}

export function tierLabel(t: TierId): string {
  return TIERS.find((x) => x.id === t)?.label ?? "Not yet";
}

/** The next tier up and how many more attended days it needs; null at the top. */
export function nextTier(attendedDays: number): { id: TierId; label: string; daysNeeded: number } | null {
  const n = Math.max(0, attendedDays);
  const next = TIERS.find((t) => n < t.min);
  return next ? { id: next.id, label: next.label, daysNeeded: next.min - n } : null;
}

export const SILVER_PLUS: readonly TierId[] = ["SILVER", "GOLD"];
export const hasFreeReschedule = (t: TierId): boolean => SILVER_PLUS.includes(t);
export const hasQuarterlyPerk = (t: TierId): boolean => t === "GOLD";

/** "2026-Q4" for a calendar day "YYYY-MM-DD" (the perk expires when the quarter changes). */
export function quarterOf(day: string): string {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(day);
  if (!m) throw new Error("bad day");
  return `${m[1]}-Q${Math.floor((Number(m[2]) - 1) / 3) + 1}`;
}

/** "YYYY-MM" of a Date in UTC (the referral cap is per calendar month). */
export function monthOf(d: Date): string {
  return d.toISOString().slice(0, 7);
}

export const COMEBACK_DAYS = 30;
const DAY_MS = 86_400_000;
const dayNumber = (day: string) => Math.floor(Date.parse(`${day}T00:00:00Z`) / DAY_MS);

/** True when `day` is 1 to 30 days after the previous attended day. (The same day never counts twice; a first visit has no previous.) */
export function isComeback(previousDay: string | null, day: string): boolean {
  if (!previousDay) return false;
  const gap = dayNumber(day) - dayNumber(previousDay);
  return gap >= 1 && gap <= COMEBACK_DAYS;
}

// ── Referral ──
export const REFERRAL_CAP_PER_MONTH = 5;
/** A referrer with MORE than this many attempts in a month is shown in admin for review. */
export const REFERRAL_REVIEW_ABOVE = 5;

export type ReferralBlock = "SELF" | "SAME_PHONE" | "SAME_DEVICE" | "LOOP" | "NOT_NEW";

export interface ReferralParty { identity: string; emails: string[]; phones: string[] }

/**
 * Why a referral must be refused, or null. `chain` is the people above the referrer: who referred the referrer, who referred them, and so on.
 * Same phone means ANY phone the two people have used (the referrer's known phones against the friend's phone).
 */
export function referralBlock(i: {
  referrer: ReferralParty;
  referred: { identity: string; email: string | null; phone: string | null };
  referredDevice: string | null;
  referrerDevices: string[];
  chain: string[];
  hadPriorBooking: boolean;
}): ReferralBlock | null {
  const { referrer, referred } = i;
  const email = referred.email?.trim().toLowerCase() ?? null;
  if (referrer.identity === referred.identity || (email && referrer.emails.includes(email))) return "SELF";
  const phone = referred.phone?.replace(/\D/g, "") ?? "";
  if (phone.length >= 7 && referrer.phones.some((p) => p.replace(/\D/g, "") === phone)) return "SAME_PHONE";
  if (i.referredDevice && i.referrerDevices.includes(i.referredDevice)) return "SAME_DEVICE";
  // A loop: the friend is already above the referrer (the friend referred the referrer, directly or further up).
  if (i.chain.includes(referred.identity)) return "LOOP";
  if (i.hadPriorBooking) return "NOT_NEW";
  return null;
}

export const capReached = (rewardedThisMonth: number): boolean => rewardedThisMonth >= REFERRAL_CAP_PER_MONTH;
export const needsReview = (attemptsThisMonth: number): boolean => attemptsThisMonth > REFERRAL_REVIEW_ABOVE;

/** Referral codes avoid look-alike characters (0/O, 1/I/L). */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const REFERRAL_CODE_LENGTH = 8;
export function isReferralCode(s: string): boolean {
  return new RegExp(`^[${CODE_ALPHABET}]{${REFERRAL_CODE_LENGTH}}$`).test(s);
}
