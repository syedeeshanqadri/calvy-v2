import { describe, expect, it, vi } from "vitest";
import type { Charge } from "@/lib/fees";

const state = { waiver: false, reward: false, level: "STARTER" as string, coupon: null as null | { id: string; code: string; verdict: { ok: boolean; discountMinor?: number; message?: string } } };
vi.mock("@/lib/rewards/levelService", () => ({ feeForCustomer: async (_db: unknown, _c: unknown, base: number) => ({ level: state.level, feeMinor: state.level === "REGULAR" ? Math.min(base, 900) : state.level === "LEGEND" ? Math.min(base, 600) : base }) }));
vi.mock("@/lib/waiver", () => ({ waiverAvailable: async () => state.waiver }));
vi.mock("@/lib/rewards/service", () => ({ rewardAvailable: async () => state.reward }));
vi.mock("@/lib/coupons/service", () => ({
  CALVY_OWNER: "CALVY",
  previewCoupon: async () => (state.coupon ? { coupon: { id: state.coupon.id, code: state.coupon.code }, verdict: state.coupon.verdict } : { coupon: null, verdict: { ok: false, message: "This code is not valid." } }),
  redeemForAppointment: async () => 0,
}));
import { resolveCalvyFee } from "@/lib/coupons/booking";

const FEE: Charge = { chargeMinor: 1000, platformFeeMinor: 1000, businessShareMinor: 0, route: "CALVY" };
const GATEWAY: Charge = { chargeMinor: 50000, platformFeeMinor: 0, businessShareMinor: 50000, route: "GATEWAY" };
const NONE: Charge = { chargeMinor: 0, platformFeeMinor: 0, businessShareMinor: 0, route: "NONE" };
const reset = (o: Partial<typeof state> = {}) => Object.assign(state, { waiver: false, reward: false, level: "STARTER", coupon: null }, o);
const call = (fullCharge: Charge, couponCode: string | null, verified = true) =>
  resolveCalvyFee({} as never, { businessId: "b1", clientId: "c1", fullCharge, verifiedBooker: verified, customer: { email: "a@x.com" }, couponCode });

describe("resolveCalvyFee", () => {
  it("without a code or reward the fee is unchanged", async () => {
    reset();
    const r = await call(FEE, null);
    expect(r).toEqual({ ok: true, value: { charge: FEE, waived: false, rewarded: false, coupon: null, level: { id: "STARTER", feeMinor: 1000 } } });
  });
  it("a kept-fee waiver goes first and the typed coupon is not used", async () => {
    reset({ waiver: true, coupon: { id: "k", code: "SAVE", verdict: { ok: true, discountMinor: 1000 } } });
    const r = await call(FEE, "SAVE");
    expect(r.ok && r.value.waived).toBe(true);
    expect(r.ok && r.value.coupon).toBeNull();
  });
  it("a coupon that clears the fee is used and the reward is kept", async () => {
    reset({ reward: true, coupon: { id: "k", code: "SAVE", verdict: { ok: true, discountMinor: 1000 } } });
    const r = await call(FEE, "SAVE");
    expect(r.ok && r.value).toEqual(expect.objectContaining({ rewarded: false, waived: false, coupon: expect.objectContaining({ couponId: "k", discountMinor: 1000 }) }));
    expect(r.ok && r.value.charge.chargeMinor).toBe(0);
  });
  it("a partial coupon plus a reward: the reward is used, the coupon is kept (never both)", async () => {
    reset({ reward: true, coupon: { id: "k", code: "SAVE", verdict: { ok: true, discountMinor: 500 } } });
    const r = await call(FEE, "SAVE");
    expect(r.ok && r.value.rewarded).toBe(true);
    expect(r.ok && r.value.coupon).toBeNull();
    expect(r.ok && r.value.charge.chargeMinor).toBe(0);
  });
  it("a partial coupon alone reduces what is paid and keeps the route to Calvy", async () => {
    reset({ coupon: { id: "k", code: "SAVE", verdict: { ok: true, discountMinor: 500 } } });
    const r = await call(FEE, "SAVE");
    expect(r.ok && r.value.charge).toEqual({ chargeMinor: 500, platformFeeMinor: 500, businessShareMinor: 0, route: "CALVY" });
  });
  it("an unverified booker cannot spend a reward, but a coupon still works", async () => {
    reset({ reward: true, coupon: { id: "k", code: "SAVE", verdict: { ok: true, discountMinor: 500 } } });
    const r = await call(FEE, "SAVE", false);
    expect(r.ok && r.value.rewarded).toBe(false);
    expect(r.ok && r.value.charge.chargeMinor).toBe(500);
  });
  it("a bad code is refused out loud", async () => {
    reset({ coupon: { id: "k", code: "SAVE", verdict: { ok: false, message: "This code has expired." } } });
    const r = await call(FEE, "SAVE");
    expect(r).toEqual({ ok: false, status: 400, error: "This code has expired.", code: "COUPON_INVALID" });
  });
  it("a Calvy coupon cannot touch a business's own gateway charge or a free booking", async () => {
    reset({ coupon: { id: "k", code: "SAVE", verdict: { ok: true, discountMinor: 500 } } });
    expect((await call(GATEWAY, "SAVE")).ok).toBe(false);
    expect((await call(NONE, "SAVE")).ok).toBe(false);
  });
  it("a reward alone covers the fee as before", async () => {
    reset({ reward: true });
    const r = await call(FEE, null);
    expect(r.ok && r.value.rewarded).toBe(true);
  });

  describe("Calvy Levels: the level fee replaces the Rs 10 for a verified customer", () => {
    it("Regular pays Rs 9, and the level and fee are returned to be stored on the booking", async () => {
      reset({ level: "REGULAR" });
      const r = await call(FEE, null);
      expect(r.ok && r.value.charge).toEqual({ chargeMinor: 900, platformFeeMinor: 900, businessShareMinor: 0, route: "CALVY" });
      expect(r.ok && r.value.level).toEqual({ id: "REGULAR", feeMinor: 900 });
    });
    it("Legend pays the Rs 6 floor", async () => {
      reset({ level: "LEGEND" });
      const r = await call(FEE, null);
      expect(r.ok && r.value.charge.chargeMinor).toBe(600);
    });
    it("a guest (email not verified) pays the plain fee, so nobody can borrow another person's level by typing their email", async () => {
      reset({ level: "LEGEND" });
      const r = await call(FEE, null, false);
      expect(r.ok && r.value.charge.chargeMinor).toBe(1000);
      expect(r.ok && r.value.level).toEqual({ id: "STARTER", feeMinor: 1000 });
    });
    it("never applies outside Basic India: a gateway charge, or a free booking, is untouched and has no level", async () => {
      reset({ level: "LEGEND" });
      const g = await call(GATEWAY, null);
      expect(g.ok && g.value.charge).toEqual(GATEWAY);
      expect(g.ok && g.value.level).toBeNull();
      const n = await call(NONE, null);
      expect(n.ok && n.value.level).toBeNull();
    });
    it("a coupon then reduces the LEVEL fee (not the plain Rs 10), and a coupon that clears it is used", async () => {
      reset({ level: "REGULAR", coupon: { id: "k", code: "SAVE", verdict: { ok: true, discountMinor: 400 } } });
      const part = await call(FEE, "SAVE");
      expect(part.ok && part.value.charge.chargeMinor).toBe(500); // 900 - 400
      reset({ level: "REGULAR", coupon: { id: "k", code: "SAVE", verdict: { ok: true, discountMinor: 900 } } });
      const full = await call(FEE, "SAVE");
      expect(full.ok && full.value.charge.chargeMinor).toBe(0);
    });
    it("a reward covers the level fee as before", async () => {
      reset({ level: "REGULAR", reward: true });
      const r = await call(FEE, null);
      expect(r.ok && r.value.rewarded).toBe(true);
      expect(r.ok && r.value.level?.feeMinor).toBe(900);
    });
  });
});
