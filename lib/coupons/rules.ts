// Coupon rules (pure, no database). Money is integer minor units. One code per checkout; the server decides, the browser only shows.
//  - FEE: Calvy's Rs 10 confirmation fee (Basic, India). SUBSCRIPTION: the first charge of a Calvy plan. SERVICE: a business's own prices.
//  - A coupon is checked against: active, dates, target, business/plan/service targeting, minimum amount, first-booking-only,
//    total limit and per-customer limit. The limits are counted from the usage log (see ./service.ts).

export type CouponKind = "PERCENT" | "FLAT";
export type CouponTarget = "FEE" | "SUBSCRIPTION" | "SERVICE";
export const COUPON_TARGETS: readonly CouponTarget[] = ["FEE", "SUBSCRIPTION", "SERVICE"];

export interface CouponDef {
  id: string;
  ownerKey: string;
  businessId: string | null;
  code: string;
  name: string;
  target: string;
  kind: string;
  value: number;
  minAmountMinor: number;
  startsAt: Date | null;
  endsAt: Date | null;
  maxRedemptions: number | null;
  perCustomerLimit: number;
  firstBookingOnly: boolean;
  planIds: string[];
  businessIds: string[];
  serviceIds: string[];
  active: boolean;
}

export interface CouponUse { total: number; byCustomer: number }

export interface CouponContext {
  target: CouponTarget;
  /** The business the booking is at (FEE, SERVICE) or the business buying a plan (SUBSCRIPTION). */
  businessId: string;
  /** SUBSCRIPTION only. */
  planId?: string;
  /** SERVICE only: what is being booked, so a coupon limited to some services only discounts those. */
  services?: { id: string; priceMinor: number }[];
  /** FEE and SUBSCRIPTION: the amount the coupon can reduce. */
  amountMinor?: number;
  /** True when the customer has no earlier booking (at this business for SERVICE, anywhere on Calvy for FEE). */
  isFirstBooking?: boolean;
  now: Date;
}

export type CouponReason =
  | "UNKNOWN" | "INACTIVE" | "NOT_STARTED" | "EXPIRED" | "WRONG_TARGET" | "NOT_FOR_BUSINESS" | "NOT_FOR_PLAN" | "NOT_FOR_SERVICE"
  | "BELOW_MIN" | "FIRST_BOOKING_ONLY" | "LIMIT_REACHED" | "CUSTOMER_LIMIT";

export type CouponVerdict = { ok: true; discountMinor: number } | { ok: false; reason: CouponReason; message: string };

const MESSAGES: Record<CouponReason, string> = {
  UNKNOWN: "This code is not valid.",
  INACTIVE: "This code is not valid.",
  NOT_STARTED: "This code is not active yet.",
  EXPIRED: "This code has expired.",
  WRONG_TARGET: "This code is not valid here.",
  NOT_FOR_BUSINESS: "This code is not valid here.",
  NOT_FOR_PLAN: "This code is not valid for this plan.",
  NOT_FOR_SERVICE: "This code does not apply to what you chose.",
  BELOW_MIN: "This code needs a higher order amount.",
  FIRST_BOOKING_ONLY: "This code is only for a first booking.",
  LIMIT_REACHED: "This code has been fully used.",
  CUSTOMER_LIMIT: "You have already used this code.",
};
const no = (reason: CouponReason): CouponVerdict => ({ ok: false, reason, message: MESSAGES[reason] });

/** Codes are upper-case letters, digits, dash and underscore; typed codes are trimmed and upper-cased before lookup. */
export function normalizeCode(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, "");
}
export const CODE_PATTERN = /^[A-Z0-9_-]{3,24}$/;

/** Percentage rounds down (never gives more than the rate); a flat amount never exceeds what it is applied to. */
export function discountFor(kind: string, value: number, amountMinor: number): number {
  const amount = Math.max(0, Math.floor(amountMinor));
  if (kind === "PERCENT") return Math.min(amount, Math.floor((amount * Math.min(100, Math.max(0, value))) / 100));
  if (kind === "FLAT") return Math.min(amount, Math.max(0, Math.floor(value)));
  return 0;
}

/** Decide whether a coupon applies and how much it takes off. `use` is how often it has been used (total and by this customer). */
export function evaluateCoupon(c: CouponDef | null, ctx: CouponContext, use: CouponUse): CouponVerdict {
  if (!c) return no("UNKNOWN");
  if (!c.active) return no("INACTIVE");
  if (c.target !== ctx.target) return no("WRONG_TARGET");
  if (c.startsAt && ctx.now < c.startsAt) return no("NOT_STARTED");
  if (c.endsAt && ctx.now >= c.endsAt) return no("EXPIRED");
  // A business coupon only works at its own business; a Calvy coupon may be limited to some businesses.
  if (c.businessId && c.businessId !== ctx.businessId) return no("NOT_FOR_BUSINESS");
  if (!c.businessId && c.businessIds.length > 0 && !c.businessIds.includes(ctx.businessId)) return no("NOT_FOR_BUSINESS");
  if (ctx.target === "SUBSCRIPTION" && c.planIds.length > 0 && !(ctx.planId && c.planIds.includes(ctx.planId))) return no("NOT_FOR_PLAN");

  let amount = ctx.amountMinor ?? 0;
  if (ctx.target === "SERVICE") {
    const eligible = (ctx.services ?? []).filter((s) => c.serviceIds.length === 0 || c.serviceIds.includes(s.id));
    if (eligible.length === 0) return no("NOT_FOR_SERVICE");
    amount = eligible.reduce((sum, s) => sum + Math.max(0, s.priceMinor), 0);
  }
  if (amount <= 0) return no("BELOW_MIN");
  if (amount < c.minAmountMinor) return no("BELOW_MIN");
  if (c.firstBookingOnly && ctx.isFirstBooking === false) return no("FIRST_BOOKING_ONLY");
  if (c.maxRedemptions !== null && use.total >= c.maxRedemptions) return no("LIMIT_REACHED");
  if (use.byCustomer >= Math.max(1, c.perCustomerLimit)) return no("CUSTOMER_LIMIT");

  const discountMinor = discountFor(c.kind, c.value, amount);
  return discountMinor > 0 ? { ok: true, discountMinor } : no("BELOW_MIN");
}

/** Spread a discount over services in proportion to their price, in minor units, so the parts add up exactly. */
export function allocateDiscount(pricesMinor: number[], discountMinor: number): number[] {
  const total = pricesMinor.reduce((a, b) => a + Math.max(0, b), 0);
  if (total <= 0 || discountMinor <= 0) return pricesMinor.map(() => 0);
  const capped = Math.min(discountMinor, total);
  const parts = pricesMinor.map((p) => Math.floor((Math.max(0, p) * capped) / total));
  let left = capped - parts.reduce((a, b) => a + b, 0);
  for (let i = 0; i < parts.length && left > 0; i++) {
    const room = Math.max(0, pricesMinor[i]) - parts[i];
    const add = Math.min(room, left);
    parts[i] += add;
    left -= add;
  }
  return parts;
}

/** The smallest online payment Cashfree takes; a fee coupon never leaves less than this to pay (it clears the fee instead). */
export const MIN_ONLINE_MINOR = 100;

export type CalvyBenefit = { use: "COUPON"; remainderMinor: number } | { use: "REWARD"; remainderMinor: 0 } | { use: "NONE"; remainderMinor: number };

/**
 * Calvy's Rs 10 can be reduced by ONE thing: a Calvy coupon OR a loyalty reward, never both.
 *  - A coupon that clears the whole fee wins, and the reward is kept for later.
 *  - Otherwise a ready reward (which clears the fee) beats a partial coupon, and the coupon is kept.
 *  - Otherwise a partial coupon applies.
 * A kept-fee waiver is decided before this (the caller skips this when the waiver already took the fee).
 */
export function chooseCalvyBenefit(i: { feeMinor: number; couponDiscountMinor: number | null; rewardReady: boolean }): CalvyBenefit {
  const fee = Math.max(0, i.feeMinor);
  if (fee === 0) return { use: "NONE", remainderMinor: 0 };
  let remainder = i.couponDiscountMinor ? fee - Math.min(fee, i.couponDiscountMinor) : fee;
  if (i.couponDiscountMinor && remainder > 0 && remainder < MIN_ONLINE_MINOR) remainder = 0;
  if (i.couponDiscountMinor && remainder === 0) return { use: "COUPON", remainderMinor: 0 };
  if (i.rewardReady) return { use: "REWARD", remainderMinor: 0 };
  if (i.couponDiscountMinor) return { use: "COUPON", remainderMinor: remainder };
  return { use: "NONE", remainderMinor: fee };
}

/** Same minimum for a plan's first charge: a coupon can take off at most all but Rs 1 (the mandate authorisation needs a real payment). */
export function capSubscriptionDiscount(dueMinor: number, discountMinor: number): number {
  return Math.max(0, Math.min(discountMinor, dueMinor - MIN_ONLINE_MINOR));
}
