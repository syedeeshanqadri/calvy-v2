import { describe, expect, it } from "vitest";
import { CODE_PATTERN, MIN_ONLINE_MINOR, allocateDiscount, capSubscriptionDiscount, chooseCalvyBenefit, discountFor, evaluateCoupon, normalizeCode, type CouponDef } from "@/lib/coupons/rules";
import { couponInputSchema } from "@/lib/coupons/validation";

const NOW = new Date("2026-11-20T10:00:00Z");
const base: CouponDef = {
  id: "c1", ownerKey: "CALVY", businessId: null, code: "WELCOME", name: "Welcome", target: "FEE", kind: "FLAT", value: 500, minAmountMinor: 0,
  startsAt: null, endsAt: null, maxRedemptions: null, perCustomerLimit: 1, firstBookingOnly: false, planIds: [], businessIds: [], serviceIds: [], active: true,
};
const fee = { target: "FEE" as const, businessId: "b1", amountMinor: 1000, now: NOW };
const none = { total: 0, byCustomer: 0 };
const reason = (v: ReturnType<typeof evaluateCoupon>) => (v.ok ? "OK" : v.reason);

describe("discountFor", () => {
  it("rounds a percentage down and never exceeds the amount", () => {
    expect(discountFor("PERCENT", 15, 999)).toBe(149);
    expect(discountFor("PERCENT", 100, 1000)).toBe(1000);
    expect(discountFor("PERCENT", 250, 1000)).toBe(1000);
    expect(discountFor("FLAT", 5000, 1000)).toBe(1000);
    expect(discountFor("FLAT", 500, 1000)).toBe(500);
    expect(discountFor("BOGUS", 500, 1000)).toBe(0);
    expect(discountFor("FLAT", -5, 1000)).toBe(0);
  });
});

describe("evaluateCoupon", () => {
  it("accepts a valid coupon", () => expect(evaluateCoupon(base, fee, none)).toEqual({ ok: true, discountMinor: 500 }));
  it("refuses an unknown or switched-off code with the same message (no enumeration)", () => {
    const a = evaluateCoupon(null, fee, none);
    const b = evaluateCoupon({ ...base, active: false }, fee, none);
    expect(a.ok || b.ok).toBe(false);
    expect(!a.ok && !b.ok && a.message === b.message).toBe(true);
  });
  it("checks the dates", () => {
    expect(reason(evaluateCoupon({ ...base, startsAt: new Date("2026-11-21T00:00:00Z") }, fee, none))).toBe("NOT_STARTED");
    expect(reason(evaluateCoupon({ ...base, endsAt: new Date("2026-11-20T10:00:00Z") }, fee, none))).toBe("EXPIRED");
    expect(reason(evaluateCoupon({ ...base, endsAt: new Date("2026-11-20T10:00:01Z") }, fee, none))).toBe("OK");
  });
  it("refuses the wrong target (a fee coupon on a plan, a plan coupon on a fee)", () => {
    expect(reason(evaluateCoupon(base, { ...fee, target: "SUBSCRIPTION", planId: "professional" }, none))).toBe("WRONG_TARGET");
    expect(reason(evaluateCoupon({ ...base, target: "SUBSCRIPTION" }, fee, none))).toBe("WRONG_TARGET");
  });
  it("keeps a business coupon at its own business, and honours a Calvy coupon's business list", () => {
    expect(reason(evaluateCoupon({ ...base, target: "SERVICE", ownerKey: "b2", businessId: "b2" }, { target: "SERVICE", businessId: "b1", services: [{ id: "s", priceMinor: 1000 }], now: NOW }, none))).toBe("NOT_FOR_BUSINESS");
    expect(reason(evaluateCoupon({ ...base, businessIds: ["b9"] }, fee, none))).toBe("NOT_FOR_BUSINESS");
    expect(reason(evaluateCoupon({ ...base, businessIds: ["b1"] }, fee, none))).toBe("OK");
  });
  it("limits a plan coupon to its plans", () => {
    const c = { ...base, target: "SUBSCRIPTION", planIds: ["business"] };
    const ctx = { target: "SUBSCRIPTION" as const, businessId: "b1", amountMinor: 100000, now: NOW };
    expect(reason(evaluateCoupon(c, { ...ctx, planId: "professional" }, none))).toBe("NOT_FOR_PLAN");
    expect(reason(evaluateCoupon(c, { ...ctx, planId: "business" }, none))).toBe("OK");
    expect(reason(evaluateCoupon(c, ctx, none))).toBe("NOT_FOR_PLAN");
  });
  it("applies the minimum amount, and only to eligible services for a service coupon", () => {
    expect(reason(evaluateCoupon({ ...base, minAmountMinor: 2000 }, fee, none))).toBe("BELOW_MIN");
    const svc = { ...base, target: "SERVICE", kind: "PERCENT", value: 10, ownerKey: "b1", businessId: "b1", serviceIds: ["a"] };
    const ctx = { target: "SERVICE" as const, businessId: "b1", now: NOW, services: [{ id: "a", priceMinor: 10000 }, { id: "b", priceMinor: 50000 }] };
    expect(evaluateCoupon(svc, ctx, none)).toEqual({ ok: true, discountMinor: 1000 });
    expect(reason(evaluateCoupon(svc, { ...ctx, services: [{ id: "b", priceMinor: 50000 }] }, none))).toBe("NOT_FOR_SERVICE");
    expect(reason(evaluateCoupon({ ...svc, minAmountMinor: 20000 }, ctx, none))).toBe("BELOW_MIN");
  });
  it("first-booking-only refuses a returning customer", () => {
    const c = { ...base, firstBookingOnly: true };
    expect(reason(evaluateCoupon(c, { ...fee, isFirstBooking: false }, none))).toBe("FIRST_BOOKING_ONLY");
    expect(reason(evaluateCoupon(c, { ...fee, isFirstBooking: true }, none))).toBe("OK");
  });
  it("enforces the total and per-customer limits", () => {
    expect(reason(evaluateCoupon({ ...base, maxRedemptions: 3 }, fee, { total: 3, byCustomer: 0 }))).toBe("LIMIT_REACHED");
    expect(reason(evaluateCoupon({ ...base, maxRedemptions: 3 }, fee, { total: 2, byCustomer: 0 }))).toBe("OK");
    expect(reason(evaluateCoupon(base, fee, { total: 1, byCustomer: 1 }))).toBe("CUSTOMER_LIMIT");
    expect(reason(evaluateCoupon({ ...base, perCustomerLimit: 2 }, fee, { total: 1, byCustomer: 1 }))).toBe("OK");
  });
  it("a zero-amount order never gets a discount", () => expect(reason(evaluateCoupon(base, { ...fee, amountMinor: 0 }, none))).toBe("BELOW_MIN"));
});

describe("allocateDiscount", () => {
  it("splits in proportion and adds up exactly", () => {
    const parts = allocateDiscount([10000, 20000, 30000], 1000);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1000);
    expect(parts[2]).toBeGreaterThanOrEqual(parts[0]);
  });
  it("never discounts more than a price, or than the total", () => {
    expect(allocateDiscount([100, 100], 5000)).toEqual([100, 100]);
    expect(allocateDiscount([0, 0], 100)).toEqual([0, 0]);
    expect(allocateDiscount([1, 1, 1], 2).reduce((a, b) => a + b, 0)).toBe(2);
  });
});

describe("chooseCalvyBenefit: a Calvy coupon OR a reward, never both", () => {
  it("a coupon that clears the whole fee wins and the reward is kept", () => {
    expect(chooseCalvyBenefit({ feeMinor: 1000, couponDiscountMinor: 1000, rewardReady: true })).toEqual({ use: "COUPON", remainderMinor: 0 });
    expect(chooseCalvyBenefit({ feeMinor: 1000, couponDiscountMinor: 5000, rewardReady: true })).toEqual({ use: "COUPON", remainderMinor: 0 });
  });
  it("a ready reward beats a partial coupon, which is kept", () => {
    expect(chooseCalvyBenefit({ feeMinor: 1000, couponDiscountMinor: 500, rewardReady: true })).toEqual({ use: "REWARD", remainderMinor: 0 });
  });
  it("a partial coupon applies when there is no reward", () => {
    expect(chooseCalvyBenefit({ feeMinor: 1000, couponDiscountMinor: 500, rewardReady: false })).toEqual({ use: "COUPON", remainderMinor: 500 });
  });
  it("never leaves a remainder smaller than the minimum online payment (the fee is cleared instead)", () => {
    expect(chooseCalvyBenefit({ feeMinor: 1000, couponDiscountMinor: 1000 - MIN_ONLINE_MINOR + 1, rewardReady: false })).toEqual({ use: "COUPON", remainderMinor: 0 });
    expect(chooseCalvyBenefit({ feeMinor: 1000, couponDiscountMinor: 1000 - MIN_ONLINE_MINOR, rewardReady: false })).toEqual({ use: "COUPON", remainderMinor: MIN_ONLINE_MINOR });
  });
  it("a reward alone, or nothing", () => {
    expect(chooseCalvyBenefit({ feeMinor: 1000, couponDiscountMinor: null, rewardReady: true })).toEqual({ use: "REWARD", remainderMinor: 0 });
    expect(chooseCalvyBenefit({ feeMinor: 1000, couponDiscountMinor: null, rewardReady: false })).toEqual({ use: "NONE", remainderMinor: 1000 });
    expect(chooseCalvyBenefit({ feeMinor: 0, couponDiscountMinor: 500, rewardReady: true })).toEqual({ use: "NONE", remainderMinor: 0 });
  });
  it("never reports both (property check over a grid)", () => {
    for (const d of [null, 0, 1, 500, 900, 901, 1000, 9999]) for (const r of [true, false]) {
      const b = chooseCalvyBenefit({ feeMinor: 1000, couponDiscountMinor: d, rewardReady: r });
      expect(["COUPON", "REWARD", "NONE"]).toContain(b.use);
    }
  });
});

describe("capSubscriptionDiscount", () => {
  it("leaves at least Rs 1 to pay", () => {
    expect(capSubscriptionDiscount(99900, 5000)).toBe(5000);
    expect(capSubscriptionDiscount(99900, 99900)).toBe(99900 - MIN_ONLINE_MINOR);
    expect(capSubscriptionDiscount(50, 100)).toBe(0);
  });
});

describe("codes and input", () => {
  it("normalises typed codes", () => {
    expect(normalizeCode("  welcome 10 ")).toBe("WELCOME10");
    expect(CODE_PATTERN.test("WELCOME10")).toBe(true);
    expect(CODE_PATTERN.test("a b")).toBe(false);
    expect(CODE_PATTERN.test("AB")).toBe(false);
  });
  const ok = { code: "save10", name: "Save", target: "FEE", kind: "PERCENT", value: 10 };
  it("accepts a good definition and normalises the code", () => {
    const r = couponInputSchema.safeParse(ok);
    expect(r.success && r.data.code).toBe("SAVE10");
  });
  it("rejects bad input", () => {
    expect(couponInputSchema.safeParse({ ...ok, value: 150 }).success).toBe(false);
    expect(couponInputSchema.safeParse({ ...ok, code: "x" }).success).toBe(false);
    expect(couponInputSchema.safeParse({ ...ok, startsAt: "2026-12-02T00:00:00Z", endsAt: "2026-12-01T00:00:00Z" }).success).toBe(false);
    expect(couponInputSchema.safeParse({ ...ok, target: "SUBSCRIPTION", planIds: ["gold"] }).success).toBe(false);
    expect(couponInputSchema.safeParse({ ...ok, value: 0 }).success).toBe(false);
  });
});
