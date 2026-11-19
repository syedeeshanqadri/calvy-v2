import { beforeEach, describe, expect, it, vi } from "vitest";
import { CALVY_OWNER, CouponUnavailableError, hasPriorBooking, previewCoupon, redeemForAppointment, redeemForSubscription } from "@/lib/coupons/service";
import type { CouponDef } from "@/lib/coupons/rules";

type Red = { id: string; couponId: string; identity: string; appointmentId: string | null; subscriptionId: string | null; discountMinor: number };

/** In-memory stand-in for the Prisma calls the coupon service makes. The advisory lock and the stale-use sweep are no-ops here. */
function fakeDb(coupon: Partial<CouponDef> = {}, prior = 0) {
  const def: CouponDef = {
    id: "c1", ownerKey: CALVY_OWNER, businessId: null, code: "SAVE", name: "Save", target: "FEE", kind: "FLAT", value: 500, minAmountMinor: 0,
    startsAt: null, endsAt: null, maxRedemptions: null, perCustomerLimit: 1, firstBookingOnly: false, planIds: [], businessIds: [], serviceIds: [], active: true, ...coupon,
  };
  const reds: Red[] = [];
  let n = 0;
  const db = {
    $executeRaw: async () => 0,
    coupon: {
      findUnique: async ({ where }: { where: { id?: string; ownerKey_code?: { ownerKey: string; code: string } } }) =>
        where.id ? (where.id === def.id ? def : null) : where.ownerKey_code?.ownerKey === def.ownerKey && where.ownerKey_code.code === def.code ? def : null,
    },
    couponRedemption: {
      count: async ({ where }: { where: { couponId: string; identity?: string } }) => reds.filter((r) => r.couponId === where.couponId && (!where.identity || r.identity === where.identity)).length,
      create: async ({ data }: { data: Omit<Red, "id" | "appointmentId" | "subscriptionId"> & { appointmentId?: string; subscriptionId?: string } }) => {
        if (data.appointmentId && reds.some((r) => r.appointmentId === data.appointmentId)) throw Object.assign(new Error("Unique"), { code: "P2002" });
        reds.push({ id: `r${++n}`, appointmentId: data.appointmentId ?? null, subscriptionId: data.subscriptionId ?? null, ...data });
      },
    },
    appointment: { count: async () => prior },
  };
  return { db: db as never, def, reds };
}
const cust = { email: "ann@x.com", phone: null, tz: "Asia/Kolkata" };
const feeCtx = { target: "FEE" as const, businessId: "b1", amountMinor: 1000 };

describe("previewCoupon", () => {
  it("finds a code regardless of case and spaces, and does not use it", async () => {
    const f = fakeDb();
    const r = await previewCoupon(f.db, { ownerKey: CALVY_OWNER, code: " save ", ctx: feeCtx, customer: cust });
    expect(r.verdict).toEqual({ ok: true, discountMinor: 500 });
    expect(f.reds).toHaveLength(0);
  });
  it("an unknown code and a code of another owner are not found", async () => {
    const f = fakeDb();
    expect((await previewCoupon(f.db, { ownerKey: CALVY_OWNER, code: "NOPE", ctx: feeCtx, customer: cust })).verdict.ok).toBe(false);
    expect((await previewCoupon(f.db, { ownerKey: "biz9", code: "SAVE", ctx: feeCtx, customer: cust })).verdict.ok).toBe(false);
  });
  it("first-booking-only looks at earlier bookings", async () => {
    const used = fakeDb({ firstBookingOnly: true }, 1);
    expect((await previewCoupon(used.db, { ownerKey: CALVY_OWNER, code: "SAVE", ctx: feeCtx, customer: cust })).verdict.ok).toBe(false);
    const fresh = fakeDb({ firstBookingOnly: true }, 0);
    expect((await previewCoupon(fresh.db, { ownerKey: CALVY_OWNER, code: "SAVE", ctx: feeCtx, customer: cust })).verdict.ok).toBe(true);
  });
});

describe("redeemForAppointment: abuse cases", () => {
  const redeem = (f: ReturnType<typeof fakeDb>, appointmentId: string, customer: { email?: string | null; phone?: string | null; tz?: string | null } = cust) =>
    redeemForAppointment((f.db as never) as never, { couponId: "c1", appointmentId, customer, ctx: feeCtx });
  beforeEach(() => vi.useRealTimers());

  it("takes one use and logs it against the appointment", async () => {
    const f = fakeDb();
    expect(await redeem(f, "a1")).toBe(500);
    expect(f.reds).toEqual([expect.objectContaining({ identity: "e:ann@x.com", appointmentId: "a1", discountMinor: 500 })]);
  });
  it("the same customer cannot use a one-per-customer code twice (even with different case in the email)", async () => {
    const f = fakeDb();
    await redeem(f, "a1");
    await expect(redeem(f, "a2")).rejects.toBeInstanceOf(CouponUnavailableError);
    await expect(redeem(f, "a3", { ...cust, email: "ANN@x.com" })).rejects.toBeInstanceOf(CouponUnavailableError);
  });
  it("a repeat of the same booking cannot take a second use (unique appointment)", async () => {
    const f = fakeDb({ perCustomerLimit: 5 });
    await redeem(f, "a1");
    await expect(redeem(f, "a1")).rejects.toThrow();
    expect(f.reds).toHaveLength(1);
  });
  it("the total limit holds across different customers", async () => {
    const f = fakeDb({ maxRedemptions: 2 });
    await redeem(f, "a1", { ...cust, email: "a@x.com" });
    await redeem(f, "a2", { ...cust, email: "b@x.com" });
    await expect(redeem(f, "a3", { ...cust, email: "c@x.com" })).rejects.toBeInstanceOf(CouponUnavailableError);
    expect(f.reds).toHaveLength(2);
  });
  it("refuses an expired, switched-off or not-yet-active code even if it was fine at preview time", async () => {
    await expect(redeem(fakeDb({ endsAt: new Date(Date.now() - 1000) }), "a1")).rejects.toBeInstanceOf(CouponUnavailableError);
    await expect(redeem(fakeDb({ active: false }), "a1")).rejects.toBeInstanceOf(CouponUnavailableError);
    await expect(redeem(fakeDb({ startsAt: new Date(Date.now() + 60_000) }), "a1")).rejects.toBeInstanceOf(CouponUnavailableError);
  });
  it("refuses a code for another business", async () => {
    await expect(redeem(fakeDb({ businessIds: ["other"] }), "a1")).rejects.toBeInstanceOf(CouponUnavailableError);
  });
  it("refuses a person with no email or phone (no identity to count against)", async () => {
    await expect(redeem(fakeDb(), "a1", { email: null, phone: null, tz: "Asia/Kolkata" })).rejects.toBeInstanceOf(CouponUnavailableError);
  });
  it("first-booking-only is re-checked at redemption", async () => {
    await expect(redeem(fakeDb({ firstBookingOnly: true }, 2), "a1")).rejects.toBeInstanceOf(CouponUnavailableError);
  });
});

describe("redeemForSubscription", () => {
  const sub = (f: ReturnType<typeof fakeDb>, subscriptionId: string, businessId = "b1", planId = "professional") =>
    redeemForSubscription(f.db as never, { couponId: "c1", subscriptionId, businessId, planId, amountMinor: 99900 });
  it("counts per business and tied to the subscription", async () => {
    const f = fakeDb({ target: "SUBSCRIPTION", kind: "PERCENT", value: 20 });
    expect(await sub(f, "s1")).toBe(19980);
    expect(f.reds[0]).toEqual(expect.objectContaining({ identity: "b:b1", subscriptionId: "s1" }));
    await expect(sub(f, "s2")).rejects.toBeInstanceOf(CouponUnavailableError);
    expect(await sub(f, "s3", "b2")).toBe(19980);
  });
  it("refuses a plan the coupon is not for", async () => {
    const f = fakeDb({ target: "SUBSCRIPTION", planIds: ["business"], kind: "FLAT", value: 1000 });
    await expect(sub(f, "s1", "b1", "professional")).rejects.toBeInstanceOf(CouponUnavailableError);
    expect(await sub(f, "s1", "b1", "business")).toBe(1000);
  });
});

describe("hasPriorBooking", () => {
  it("is false when neither email nor phone is known", async () => {
    expect(await hasPriorBooking(fakeDb().db, { email: null, phone: null })).toBe(false);
  });
  it("is true when an earlier booking is found", async () => {
    expect(await hasPriorBooking(fakeDb({}, 1).db, { email: "ann@x.com" })).toBe(true);
  });
});
