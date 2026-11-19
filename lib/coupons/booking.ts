// Calvy's Rs 10 confirmation fee at booking time: what reduces it, and in which order (shared by the time-slot and token booking paths).
//   1. A kept-fee waiver (an earlier cancelled or not-attended booking at this business) always goes first.
//   2. Then ONE of: a Calvy coupon or a loyalty reward, never both (see chooseCalvyBenefit in ./rules.ts).
// Nothing is spent here: the caller takes the waiver / reward / coupon inside the booking's own transaction with the claim* helpers.
import type { Prisma } from "@prisma/client";
import type { prisma } from "@/lib/prisma";
import type { Charge } from "@/lib/fees";
import { waiverAvailable } from "@/lib/waiver";
import { rewardAvailable } from "@/lib/rewards/service";
import { rewardApplies } from "@/lib/rewards/rules";
import { chooseCalvyBenefit } from "./rules";
import { CALVY_OWNER, previewCoupon, redeemForAppointment } from "./service";

type Db = Prisma.TransactionClient | typeof prisma;

const FREE: Charge = { chargeMinor: 0, platformFeeMinor: 0, businessShareMinor: 0, route: "NONE" };

export interface FeeResolution {
  charge: Charge;
  waived: boolean;
  rewarded: boolean;
  coupon: { couponId: string; code: string; discountMinor: number; feeMinor: number } | null;
}
export type FeeResult = { ok: true; value: FeeResolution } | { ok: false; status: number; error: string; code: string };

export async function resolveCalvyFee(db: Db, i: {
  businessId: string; clientId: string | null; fullCharge: Charge; verifiedBooker: boolean;
  customer: { email?: string | null; phone?: string | null; tz?: string | null }; couponCode?: string | null; now?: Date;
}): Promise<FeeResult> {
  const { fullCharge } = i;
  const isFee = fullCharge.route === "CALVY" && fullCharge.chargeMinor > 0 && fullCharge.platformFeeMinor > 0;
  const code = i.couponCode?.trim() || null;
  let coupon: FeeResolution["coupon"] = null;
  let couponDiscount: number | null = null;

  // A typed code that cannot work here is refused out loud, not silently ignored.
  if (code && !isFee) return { ok: false, status: 400, error: "This code is not valid here.", code: "COUPON_INVALID" };

  if (isFee && i.clientId && (await waiverAvailable(db, i.businessId, i.clientId))) return { ok: true, value: { charge: FREE, waived: true, rewarded: false, coupon: null } };

  if (isFee && code) {
    const { coupon: def, verdict } = await previewCoupon(db, {
      ownerKey: CALVY_OWNER, code, ctx: { target: "FEE", businessId: i.businessId, amountMinor: fullCharge.platformFeeMinor }, customer: i.customer, now: i.now,
    });
    if (!def || !verdict.ok) return { ok: false, status: 400, error: verdict.ok ? "This code is not valid." : verdict.message, code: "COUPON_INVALID" };
    couponDiscount = verdict.discountMinor;
    coupon = { couponId: def.id, code: def.code, discountMinor: verdict.discountMinor, feeMinor: fullCharge.platformFeeMinor };
  }

  const rewardReady = isFee && i.verifiedBooker && rewardApplies(fullCharge) && (await rewardAvailable(db, i.customer));
  const benefit = chooseCalvyBenefit({ feeMinor: isFee ? fullCharge.platformFeeMinor : 0, couponDiscountMinor: couponDiscount, rewardReady });

  if (benefit.use === "REWARD") return { ok: true, value: { charge: FREE, waived: false, rewarded: true, coupon: null } };
  if (benefit.use === "COUPON" && coupon) {
    const charge: Charge = benefit.remainderMinor === 0 ? FREE : { chargeMinor: benefit.remainderMinor, platformFeeMinor: benefit.remainderMinor, businessShareMinor: 0, route: "CALVY" };
    return { ok: true, value: { charge, waived: false, rewarded: false, coupon: { ...coupon, discountMinor: coupon.feeMinor - benefit.remainderMinor } } };
  }
  return { ok: true, value: { charge: fullCharge, waived: false, rewarded: false, coupon: null } };
}

/** Take the coupon's use inside the booking's transaction (the unique appointment id stops a repeat). */
export async function claimFeeCoupon(tx: Prisma.TransactionClient, p: { couponId: string; appointmentId: string; businessId: string; feeMinor: number; customer: { email?: string | null; phone?: string | null; tz?: string | null } }): Promise<number> {
  return redeemForAppointment(tx, { couponId: p.couponId, appointmentId: p.appointmentId, customer: p.customer, ctx: { target: "FEE", businessId: p.businessId, amountMinor: p.feeMinor } });
}
