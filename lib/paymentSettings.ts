import { z } from "zod";
import { computeCharge, FULL_ONLINE_ENABLED, type FeePayer, type OnlinePayMode } from "@/lib/fees";

/** Owner-saved online payment settings. "Full online" cannot be chosen until payouts exist (FULL_ONLINE_ENABLED). */
export const paymentSettingsSchema = z
  .object({
    onlinePayMode: z.enum(["BOOKING_FEE_ONLY", "FULL_ONLINE"]).optional(),
    feePayer: z.enum(["CUSTOMER", "BUSINESS"]).optional(),
  })
  .refine((v) => v.onlinePayMode !== undefined || v.feePayer !== undefined, { message: "Nothing to save." })
  .refine((v) => v.onlinePayMode !== "FULL_ONLINE" || FULL_ONLINE_ENABLED, {
    message: "Full online payment isn't available yet. It needs a payout account, which comes later.",
    path: ["onlinePayMode"],
  });

export interface PayExample {
  /** What the customer pays online for a booking priced `priceMinor`. */
  customerPaysMinor: number;
  /** What the business receives from it (0 for the booking fee, which Calvy keeps). */
  businessGetsMinor: number;
  /** Calvy's fee in it. */
  calvyFeeMinor: number;
}

/** Worked example for the settings screen: an India booking of `priceMinor` under this mode and payer. */
export function payExample(i: { mode: OnlinePayMode; payer: FeePayer; feeMinorIN: number; priceMinor: number }): PayExample {
  const c = computeCharge({ country: "IN", platformFeeMinorIN: i.feeMinorIN, mode: i.mode, payer: i.payer, priceMinor: i.priceMinor });
  return { customerPaysMinor: c.chargeMinor, businessGetsMinor: c.businessShareMinor, calvyFeeMinor: c.platformFeeMinor };
}
