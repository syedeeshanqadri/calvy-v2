// Online booking charge calculator (pure). Money is in integer minor units (paise / cents).
// Rules: docs/steps-3-5-design.md "Booking flow per mode". Gateway fees are absorbed by Calvy.

export type OnlinePayMode = "BOOKING_FEE_ONLY" | "FULL_ONLINE";
export type FeePayer = "CUSTOMER" | "BUSINESS";

/**
 * FULL_ONLINE sends the service price through Calvy's gateway account, which needs the payout
 * account and split (PLAN.md "Parked": chunk 12). Until that exists nothing may collect a business's
 * money, so every stored FULL_ONLINE is treated as BOOKING_FEE_ONLY. Flip this only with chunk 12.
 */
export const FULL_ONLINE_ENABLED = false;

export function effectivePayMode(mode: OnlinePayMode): OnlinePayMode {
  return mode === "FULL_ONLINE" && !FULL_ONLINE_ENABLED ? "BOOKING_FEE_ONLY" : mode;
}

export interface ChargeInput {
  /** ISO-2 country of the business. */
  country: string;
  /** PlanConfig.platformFeeMinorIN of the business's plan (Free = 1000, paid = 0). */
  platformFeeMinorIN: number;
  mode: OnlinePayMode;
  payer: FeePayer;
  /** Service price in minor units. */
  priceMinor: number;
}

export interface Charge {
  /** What the customer pays online now (0 = no online payment, confirm immediately). */
  chargeMinor: number;
  /** Calvy's share of the charge. */
  platformFeeMinor: number;
  /** The business's share of the charge (paid out via split; 0 in BOOKING_FEE_ONLY). */
  businessShareMinor: number;
}

/** Whole currency amount -> minor units (prices are stored as Float in the business currency). */
export function toMinor(amount: number): number {
  return Math.round(amount * 100);
}

/** Until Business.country exists (chunk 11): INR businesses are India, others international. */
export function countryFromCurrency(currency: string | null | undefined): string {
  return (currency ?? "").toUpperCase() === "INR" ? "IN" : "US";
}

export function computeCharge(input: ChargeInput): Charge {
  const none: Charge = { chargeMinor: 0, platformFeeMinor: 0, businessShareMinor: 0 };
  // International at launch: pay at venue only, never charged online.
  if (input.country !== "IN") return none;

  const fee = Math.max(0, Math.round(input.platformFeeMinorIN));
  const price = Math.max(0, Math.round(input.priceMinor));

  if (input.mode === "BOOKING_FEE_ONLY") {
    // Calvy keeps the fee; the service is paid at the venue.
    return { chargeMinor: fee, platformFeeMinor: fee, businessShareMinor: 0 };
  }
  if (input.payer === "CUSTOMER") {
    // 500 -> customer pays 510, business gets 500.
    return { chargeMinor: price + fee, platformFeeMinor: fee, businessShareMinor: price };
  }
  // Business absorbs the fee: 500 -> customer pays 500, business gets 490. Never below 0.
  const taken = Math.min(fee, price);
  return { chargeMinor: price, platformFeeMinor: taken, businessShareMinor: price - taken };
}
