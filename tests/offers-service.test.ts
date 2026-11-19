import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { priceAfterDiscount, publicOffers, resolveBusinessDiscount } from "@/lib/offers/service";
import type { CouponDef } from "@/lib/coupons/rules";
import type { OfferDef } from "@/lib/offers/rules";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const biz = { id: "b1", timezone: "Asia/Kolkata", currency: "INR" };
const lines = [{ id: "a", price: 1000 }, { id: "b", price: 500 }];
// 2026-11-24 is a Tuesday; 15:00 IST = 09:30 UTC.
const TUE_3PM = new Date("2026-11-24T09:30:00Z");

function coupon(o: Partial<CouponDef> = {}): CouponDef {
  return { id: "c1", ownerKey: "b1", businessId: "b1", code: "FIRST10", name: "First", target: "SERVICE", kind: "PERCENT", value: 10, minAmountMinor: 0, startsAt: null, endsAt: null, maxRedemptions: null, perCustomerLimit: 1, firstBookingOnly: false, planIds: [], businessIds: [], serviceIds: [], active: true, ...o };
}
function offer(o: Partial<OfferDef> = {}): OfferDef {
  return { id: "o1", kind: "HAPPY_HOUR", name: "Tuesday afternoons", percent: 20, nth: null, days: [2], startMinute: 14 * 60, endMinute: 16 * 60, serviceIds: [], startsAt: null, endsAt: null, active: true, showOnSite: true, ...o };
}
function fakeDb(o: { coupons?: CouponDef[]; offers?: OfferDef[]; completed?: number; used?: number } = {}) {
  const coupons = o.coupons ?? [];
  return {
    $executeRaw: async () => 0,
    coupon: { findUnique: async ({ where }: { where: { ownerKey_code: { ownerKey: string; code: string } } }) => coupons.find((c) => c.ownerKey === where.ownerKey_code.ownerKey && c.code === where.ownerKey_code.code) ?? null },
    couponRedemption: { count: async () => o.used ?? 0 },
    businessOffer: { findMany: async () => o.offers ?? [] },
    appointment: { count: async ({ where }: { where: { status?: unknown } }) => (where.status === "completed" ? o.completed ?? 0 : 0) },
  } as never;
}
const amount = async (...a: Parameters<typeof resolveBusinessDiscount>) => { const r = await resolveBusinessDiscount(...a); return r.ok ? r.discountMinor : -1; };
const base = { business: biz, offersEnabled: true, services: lines, start: TUE_3PM, customer: { email: "a@x.com" } };

describe("resolveBusinessDiscount", () => {
  it("does nothing on a plan without offers (and does not consume the code)", async () => {
    const r = await resolveBusinessDiscount(fakeDb({ coupons: [coupon()], offers: [offer()] }), { ...base, offersEnabled: false, couponCode: "first10" });
    expect(r).toEqual(expect.objectContaining({ ok: true, discountMinor: 0, source: null, codeConsumed: false }));
  });
  it("applies the automatic offer (happy hour) in its window", async () => {
    const r = await resolveBusinessDiscount(fakeDb({ offers: [offer()] }), base);
    expect(r).toEqual(expect.objectContaining({ ok: true, source: "OFFER", discountMinor: 30000, offer: { id: "o1", name: "Tuesday afternoons" } }));
  });
  it("no happy hour outside the window or for a token booking (no time)", async () => {
    expect(await amount(fakeDb({ offers: [offer()] }), { ...base, start: new Date("2026-11-24T05:30:00Z") })).toBe(0);
    expect(await amount(fakeDb({ offers: [offer()] }), { ...base, start: null })).toBe(0);
  });
  it("the Nth-visit offer counts attended visits only", async () => {
    const nth = offer({ kind: "NTH_VISIT", nth: 5, percent: 10, days: [], startMinute: null, endMinute: null });
    expect(await amount(fakeDb({ offers: [nth], completed: 4 }), base)).toBe(15000);
    expect(await amount(fakeDb({ offers: [nth], completed: 3 }), base)).toBe(0);
  });
  it("a valid business coupon applies", async () => {
    const r = await resolveBusinessDiscount(fakeDb({ coupons: [coupon()] }), { ...base, couponCode: " first10 " });
    expect(r).toEqual(expect.objectContaining({ ok: true, source: "COUPON", discountMinor: 15000, codeConsumed: true, coupon: { couponId: "c1", code: "FIRST10" } }));
  });
  it("the better of coupon and offer is used, never both; a worse code is kept", async () => {
    const better = await resolveBusinessDiscount(fakeDb({ coupons: [coupon({ value: 50 })], offers: [offer()] }), { ...base, couponCode: "FIRST10" });
    expect(better).toEqual(expect.objectContaining({ source: "COUPON", discountMinor: 75000, offer: null }));
    const worse = await resolveBusinessDiscount(fakeDb({ coupons: [coupon()], offers: [offer()] }), { ...base, couponCode: "FIRST10" });
    expect(worse).toEqual(expect.objectContaining({ source: "OFFER", discountMinor: 30000, codeKept: true, coupon: null }));
  });
  it("a bad business coupon is refused out loud (expired, used up, other customer limit)", async () => {
    expect(await resolveBusinessDiscount(fakeDb({ coupons: [coupon({ endsAt: new Date("2026-01-01T00:00:00Z") })] }), { ...base, couponCode: "FIRST10" })).toEqual({ ok: false, error: "This code has expired." });
    expect(await resolveBusinessDiscount(fakeDb({ coupons: [coupon({ maxRedemptions: 1 })], used: 1 }), { ...base, couponCode: "FIRST10" })).toEqual({ ok: false, error: "This code has been fully used." });
  });
  it("another business's coupon code is not found here (so it is left for Calvy's fee side)", async () => {
    const r = await resolveBusinessDiscount(fakeDb({ coupons: [coupon({ ownerKey: "b2", businessId: "b2" })] }), { ...base, couponCode: "FIRST10" });
    expect(r).toEqual(expect.objectContaining({ ok: true, codeConsumed: false, discountMinor: 0 }));
  });
  it("a coupon limited to other services does not apply", async () => {
    const r = await resolveBusinessDiscount(fakeDb({ coupons: [coupon({ serviceIds: ["zzz"] })] }), { ...base, couponCode: "FIRST10" });
    expect(r.ok).toBe(false);
  });
});

describe("priceAfterDiscount", () => {
  it("spreads the discount and the prices still add up", () => {
    const p = priceAfterDiscount(lines, 30000, "INR");
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1200, 5);
    expect(p[0]).toBeGreaterThan(p[1]);
  });
  it("never goes below zero", () => expect(priceAfterDiscount(lines, 99999999, "INR")).toEqual([0, 0]));
});

describe("publicOffers", () => {
  it("shows nothing on a plan without offers, and only those inside their dates", async () => {
    const db = { businessOffer: { findMany: async () => [offer(), offer({ id: "o2", endsAt: new Date("2020-01-01T00:00:00Z") })] } } as never;
    expect(await publicOffers(db, "b1", false)).toEqual([]);
    const shown = await publicOffers(db, "b1", true, TUE_3PM);
    expect(shown.map((o) => o.id)).toEqual(["o1"]);
    expect(shown[0].summary).toContain("20% off");
  });
});

describe("tenant isolation of the offers APIs (source checks)", () => {
  const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
  it("every offer and coupon write is scoped to the signed-in business", () => {
    const patch = read("app/api/offers/[id]/route.ts");
    expect(patch).toMatch(/updateMany\(\{ where: \{ id, businessId: session\.user\.businessId \}/);
    expect(patch).toMatch(/deleteMany\(\{ where: \{ id, businessId: session\.user\.businessId \}/);
    const cp = read("app/api/offers/coupons/[id]/route.ts");
    expect(cp).toMatch(/where: \{ id, ownerKey: businessId, businessId \}/);
  });
  it("a coupon's owner comes from the session, never from the request, and the routes are plan-gated", () => {
    const create = read("app/api/offers/coupons/route.ts");
    expect(create).toMatch(/ownerKey: businessId, businessId/);
    expect(create).toContain('checkLimit(businessId, "offers"');
    expect(read("app/api/offers/route.ts")).toContain('checkLimit(businessId, "offers"');
    expect(read("app/dashboard/offers/page.tsx")).toContain("features.offers");
  });
  it("services named in an offer or coupon must belong to the business", () => {
    expect(read("app/api/offers/route.ts")).toContain("businessId, id: { in: o.serviceIds }");
    expect(read("app/api/offers/coupons/route.ts")).toContain("businessId, id: { in: c.serviceIds }");
  });
  it("the admin coupon routes only touch Calvy's own coupons and refuse service coupons", () => {
    expect(read("app/api/admin/coupons/[id]/route.ts")).toContain("ownerKey: CALVY_OWNER");
    expect(read("app/api/admin/coupons/route.ts")).toContain('c.target === "SERVICE"');
  });
});
