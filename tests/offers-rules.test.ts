import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { bestBusinessDiscount, bestOffer, offerDiscount, offerSummary, type OfferContext, type OfferDef } from "@/lib/offers/rules";
import { businessCouponSchema, offerInputSchema } from "@/lib/coupons/validation";
import { evaluateLimit } from "@/lib/limits";
import { PLAN_LIMITS } from "@/lib/plans";

const NOW = new Date("2026-11-20T10:00:00Z");
const offer = (o: Partial<OfferDef> = {}): OfferDef => ({ id: "o1", kind: "NTH_VISIT", name: "Fifth visit", percent: 10, nth: 5, days: [], startMinute: null, endMinute: null, serviceIds: [], startsAt: null, endsAt: null, active: true, showOnSite: true, ...o });
const ctx = (c: Partial<OfferContext> = {}): OfferContext => ({ services: [{ id: "a", priceMinor: 100000 }, { id: "b", priceMinor: 50000 }], local: { dow: 2, minutes: 15 * 60 }, completedVisits: 4, now: NOW, ...c });

describe("Nth-visit offers (attended visits only)", () => {
  it("applies on the 5th visit, i.e. after 4 attended visits", () => expect(offerDiscount(offer(), ctx())).toBe(15000));
  it("not on the 4th or 6th", () => {
    expect(offerDiscount(offer(), ctx({ completedVisits: 3 }))).toBe(0);
    expect(offerDiscount(offer(), ctx({ completedVisits: 5 }))).toBe(0);
  });
  it("repeats every Nth visit (10th)", () => expect(offerDiscount(offer(), ctx({ completedVisits: 9 }))).toBe(15000));
  it("a stranger (visits unknown) gets nothing, so a typed email cannot be guessed into a discount", () => expect(offerDiscount(offer(), ctx({ completedVisits: null }))).toBe(0));
  it("only discounts the services it covers", () => expect(offerDiscount(offer({ serviceIds: ["b"] }), ctx())).toBe(5000));
  it("a nonsense Nth (0 or 1) never applies", () => {
    expect(offerDiscount(offer({ nth: 1 }), ctx({ completedVisits: 0 }))).toBe(0);
    expect(offerDiscount(offer({ nth: null }), ctx())).toBe(0);
  });
});

describe("happy hour", () => {
  const hh = offer({ kind: "HAPPY_HOUR", nth: null, days: [2, 3], startMinute: 14 * 60, endMinute: 16 * 60 });
  it("applies inside the window on a listed day", () => expect(offerDiscount(hh, ctx())).toBe(15000));
  it("start is included, end is not", () => {
    expect(offerDiscount(hh, ctx({ local: { dow: 2, minutes: 14 * 60 } }))).toBe(15000);
    expect(offerDiscount(hh, ctx({ local: { dow: 2, minutes: 16 * 60 } }))).toBe(0);
    expect(offerDiscount(hh, ctx({ local: { dow: 2, minutes: 14 * 60 - 1 } }))).toBe(0);
  });
  it("not on another day; every day when no days are set", () => {
    expect(offerDiscount(hh, ctx({ local: { dow: 5, minutes: 15 * 60 } }))).toBe(0);
    expect(offerDiscount({ ...hh, days: [] }, ctx({ local: { dow: 5, minutes: 15 * 60 } }))).toBe(15000);
  });
  it("a token booking has no clock time, so a happy hour never applies", () => expect(offerDiscount(hh, ctx({ local: null }))).toBe(0));
});

describe("bundle packages", () => {
  const b = offer({ kind: "BUNDLE", nth: null, serviceIds: ["a", "b"], percent: 20 });
  it("applies when ALL listed services are booked, on those services only", () => {
    expect(offerDiscount(b, ctx())).toBe(30000);
    expect(offerDiscount(b, ctx({ services: [{ id: "a", priceMinor: 100000 }, { id: "b", priceMinor: 50000 }, { id: "c", priceMinor: 999 }] }))).toBe(30000);
  });
  it("not when one is missing", () => expect(offerDiscount(b, ctx({ services: [{ id: "a", priceMinor: 100000 }] }))).toBe(0));
  it("a one-service 'package' never applies", () => expect(offerDiscount(offer({ kind: "BUNDLE", serviceIds: ["a"] }), ctx())).toBe(0));
});

describe("dates and switches", () => {
  it("honours active and the date window", () => {
    expect(offerDiscount(offer({ active: false }), ctx())).toBe(0);
    expect(offerDiscount(offer({ startsAt: new Date("2026-11-21T00:00:00Z") }), ctx())).toBe(0);
    expect(offerDiscount(offer({ endsAt: new Date("2026-11-20T10:00:00Z") }), ctx())).toBe(0);
  });
  it("rejects an out-of-range percent", () => {
    expect(offerDiscount(offer({ percent: 0 }), ctx())).toBe(0);
    expect(offerDiscount(offer({ percent: 101 }), ctx())).toBe(0);
  });
});

describe("one business discount per booking, never stacked", () => {
  const a = { offer: offer({ id: "A" }), discountMinor: 1000 };
  it("the best offer wins among offers", () => {
    expect(bestOffer([offer({ id: "x", percent: 5 }), offer({ id: "y", percent: 20 })], ctx())?.offer.id).toBe("y");
    expect(bestOffer([], ctx())).toBeNull();
  });
  it("the better of coupon and offer, never both", () => {
    expect(bestBusinessDiscount({ couponId: "c", discountMinor: 2000 }, a)).toEqual({ source: "COUPON", discountMinor: 2000, couponId: "c" });
    expect(bestBusinessDiscount({ couponId: "c", discountMinor: 500 }, a)).toEqual({ source: "OFFER", discountMinor: 1000, offerId: "A", offerName: "Fifth visit" });
  });
  it("on a tie the automatic offer wins and the code is kept", () => {
    expect(bestBusinessDiscount({ couponId: "c", discountMinor: 1000 }, a).source).toBe("OFFER");
  });
  it("only a coupon, only an offer, or nothing", () => {
    expect(bestBusinessDiscount({ couponId: "c", discountMinor: 700 }, null).source).toBe("COUPON");
    expect(bestBusinessDiscount(null, a).source).toBe("OFFER");
    expect(bestBusinessDiscount(null, null)).toEqual({ source: null, discountMinor: 0 });
    expect(bestBusinessDiscount({ couponId: "c", discountMinor: 0 }, null).source).toBeNull();
  });
});

describe("summaries and input", () => {
  it("reads naturally", () => {
    expect(offerSummary(offer())).toBe("10% off every 5th visit");
    expect(offerSummary(offer({ nth: 2 }))).toBe("10% off every 2nd visit");
    expect(offerSummary(offer({ kind: "HAPPY_HOUR", days: [1, 2], startMinute: 840, endMinute: 960 }))).toBe("10% off, Mon, Tue 14:00 to 16:00");
  });
  it("validates an offer", () => {
    expect(offerInputSchema.safeParse({ kind: "NTH_VISIT", name: "x", percent: 10, nth: 5 }).success).toBe(true);
    expect(offerInputSchema.safeParse({ kind: "NTH_VISIT", name: "x", percent: 10 }).success).toBe(false);
    expect(offerInputSchema.safeParse({ kind: "NTH_VISIT", name: "x", percent: 95, nth: 5 }).success).toBe(false);
    expect(offerInputSchema.safeParse({ kind: "HAPPY_HOUR", name: "x", percent: 10, startMinute: 900, endMinute: 800 }).success).toBe(false);
    expect(offerInputSchema.safeParse({ kind: "BUNDLE", name: "x", percent: 10, serviceIds: ["a"] }).success).toBe(false);
    expect(offerInputSchema.safeParse({ kind: "BUNDLE", name: "x", percent: 10, serviceIds: ["a", "b"] }).success).toBe(true);
  });
  it("a business coupon never carries an owner or target from the request", () => {
    const r = businessCouponSchema.safeParse({ code: "first10", name: "First", kind: "PERCENT", value: 10, ownerKey: "CALVY", target: "FEE", businessId: "other" });
    expect(r.success).toBe(true);
    expect(r.success && Object.keys(r.data)).not.toEqual(expect.arrayContaining(["ownerKey", "target", "businessId"]));
    expect(businessCouponSchema.safeParse({ code: "x", name: "x", kind: "PERCENT", value: 10 }).success).toBe(false);
  });
});

describe("plan gate: paid plans only", () => {
  it("the flag is off for Free/Starter and on for Professional/Business", () => {
    expect(PLAN_LIMITS.free.offers).toBe(false);
    expect(PLAN_LIMITS.starter.offers).toBe(false);
    expect(PLAN_LIMITS.professional.offers).toBe(true);
    expect(PLAN_LIMITS.business.offers).toBe(true);
  });
  it("evaluateLimit refuses offers on a plan without the flag", () => {
    expect(evaluateLimit(PLAN_LIMITS.free, "offers")?.code).toBe("FEATURE_LOCKED");
    expect(evaluateLimit(PLAN_LIMITS.professional, "offers")).toBeNull();
  });
});
