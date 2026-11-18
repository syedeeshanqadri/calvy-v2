// Online booking charge calculator (pure). Money is in integer minor units (paise / cents).
// India only. Two mutually exclusive models, decided by the business's plan:
//  - Basic (platformFeeMinorIN > 0): ONLY Calvy's Rs 10 confirmation fee, through Calvy's Cashfree. The service is paid at the venue.
//  - Mid/Top (platformFeeMinorIN = 0): no Rs 10. Calvy never touches the money; the customer pays the business's OWN default
//    gateway according to the business's pay option (or the service's override): at the venue, in full, or an advance.

export type PayOption = "VENUE" | "ONLINE_FULL" | "ADVANCE";
export type AdvanceKind = "PERCENT" | "FIXED";
export type ChargeRoute = "NONE" | "CALVY" | "GATEWAY";

export const PAY_OPTIONS: readonly PayOption[] = ["VENUE", "ONLINE_FULL", "ADVANCE"];
export const isPayOption = (v: unknown): v is PayOption => typeof v === "string" && (PAY_OPTIONS as readonly string[]).includes(v);

export interface PaySetting { option: PayOption; advanceKind: AdvanceKind; advanceValue: number }

export interface ChargeItem {
  /** Service price in minor units. */
  priceMinor: number;
  /** The service's own override; null/undefined = use the business setting. */
  override?: Partial<PaySetting> | null;
}

export interface ChargeInput {
  /** ISO-2 country of the business. */
  country: string;
  /** PlanConfig.platformFeeMinorIN of the business's plan (Basic = 1000, Mid/Top = 0). */
  platformFeeMinorIN: number;
  business: PaySetting;
  /** The business has an enabled, verified default gateway. Without one nothing is charged online on Mid/Top. */
  hasGateway: boolean;
  items: ChargeItem[];
}

export interface Charge {
  /** What the customer pays online now (0 = no online payment, confirm immediately). */
  chargeMinor: number;
  /** Calvy's share of the charge (only the Rs 10 confirmation fee on Basic). */
  platformFeeMinor: number;
  /** The business's share, paid straight into its own gateway (0 for the confirmation fee). */
  businessShareMinor: number;
  route: ChargeRoute;
}

import { toMinorUnits } from "@/lib/currency";

/** Whole currency amount -> minor units in that currency (prices are stored as Float in the business currency; default 2 decimals). */
export function toMinor(amount: number, currency: string | null | undefined = "INR"): number {
  return toMinorUnits(amount, currency);
}

/** Until Business.country exists: INR businesses are India, others international. */
export function countryFromCurrency(currency: string | null | undefined): string {
  return (currency ?? "").toUpperCase() === "INR" ? "IN" : "US";
}

const NONE: Charge = { chargeMinor: 0, platformFeeMinor: 0, businessShareMinor: 0, route: "NONE" };

/** What one service asks to be paid online under a setting (before the gateway is checked). Never more than the price. */
export function itemCharge(price: number, s: PaySetting): number {
  const p = Math.max(0, Math.round(price));
  if (p === 0 || s.option === "VENUE") return 0;
  if (s.option === "ONLINE_FULL") return p;
  const raw = s.advanceKind === "PERCENT" ? Math.round((p * Math.min(100, Math.max(0, s.advanceValue))) / 100) : Math.round(s.advanceValue);
  return Math.min(p, Math.max(0, raw));
}

export function computeCharge(input: ChargeInput): Charge {
  const fee = Math.max(0, Math.round(input.platformFeeMinorIN));
  if (fee > 0) {
    // The plan with a platform fee is the entry plan (Basic in India, Free abroad).
    // India: Calvy's Rs 10 confirmation fee only. Business gateways and online service payments are not available.
    if (input.country === "IN") return { chargeMinor: fee, platformFeeMinor: fee, businessShareMinor: 0, route: "CALVY" };
    // International: never a Rs 10 and no own gateway on the free plan: pay at the venue.
    return NONE;
  }
  if (!input.hasGateway) return NONE;

  let total = 0;
  for (const item of input.items) {
    total += itemCharge(item.priceMinor, { ...input.business, ...(item.override ?? {}) });
  }
  return total > 0 ? { chargeMinor: total, platformFeeMinor: 0, businessShareMinor: total, route: "GATEWAY" } : NONE;
}

/** Merge a service's nullable override columns into a partial setting. */
export function overrideOf(s: { payOption?: string | null; advanceKind?: string | null; advanceValue?: number | null }): Partial<PaySetting> | null {
  if (!isPayOption(s.payOption)) return null;
  return {
    option: s.payOption,
    ...(s.advanceKind === "PERCENT" || s.advanceKind === "FIXED" ? { advanceKind: s.advanceKind } : {}),
    ...(typeof s.advanceValue === "number" ? { advanceValue: s.advanceValue } : {}),
  };
}

/** What the booking page needs to compute the online charge (safe to send to the browser). */
export interface PayConfig {
  country: string;
  /** The business currency: sets the minor unit (JPY none, KWD three decimals) and what the gateway charges in. */
  currency: string;
  platformFeeMinorIN: number;
  business: PaySetting;
  /** Mid/Top with an enabled, verified default gateway. */
  hasGateway: boolean;
  /** Per-service overrides of the business pay option, by service id. */
  overrides: Record<string, Partial<PaySetting>>;
}

/** The online charge for a booking of these services (business currency, whole units). The server is authoritative. */
export function chargeForConfig(cfg: PayConfig | null, items: { serviceId: string; price: number }[]): Charge {
  if (!cfg) return NONE;
  return computeCharge({
    country: cfg.country, platformFeeMinorIN: cfg.platformFeeMinorIN, business: cfg.business, hasGateway: cfg.hasGateway,
    items: items.map((i) => ({ priceMinor: toMinor(i.price, cfg.currency), override: cfg.overrides[i.serviceId] ?? null })),
  });
}
