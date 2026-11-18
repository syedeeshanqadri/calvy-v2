// Single source of truth for the fallback currency when a business hasn't set
// one. Must match the currency used for Razorpay charges so the amount a
// customer is shown equals the amount they're charged.
export const DEFAULT_CURRENCY = "INR";

export const CURRENCIES = [
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "GBP", symbol: "£", name: "British Pound" },
  { code: "CAD", symbol: "CA$", name: "Canadian Dollar" },
  { code: "AUD", symbol: "A$", name: "Australian Dollar" },
  { code: "AED", symbol: "AED", name: "UAE Dirham" },
  { code: "SAR", symbol: "SAR", name: "Saudi Riyal" },
  { code: "INR", symbol: "₹", name: "Indian Rupee" },
  { code: "PKR", symbol: "Rs", name: "Pakistani Rupee" },
  { code: "BDT", symbol: "৳", name: "Bangladeshi Taka" },
  { code: "MYR", symbol: "RM", name: "Malaysian Ringgit" },
  { code: "SGD", symbol: "S$", name: "Singapore Dollar" },
  { code: "NGN", symbol: "₦", name: "Nigerian Naira" },
  { code: "ZAR", symbol: "R", name: "South African Rand" },
  { code: "NZD", symbol: "NZ$", name: "New Zealand Dollar" },
];

export function formatCurrencyAmount(amount: number, currencyCode: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currencyCode,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    const symbol = CURRENCIES.find((c) => c.code === currencyCode)?.symbol ?? currencyCode;
    return `${symbol}${amount.toFixed(2)}`;
  }
}


// ---- Minor units (one place for every currency) ----
// Amounts are stored as whole currency units in the business currency (Service.price is a Float). Gateways want the smallest
// unit. Most currencies have 2 decimals (paise, cents); some have none (JPY) and some have 3 (KWD). No conversion between
// currencies ever happens: a business charges in its own currency.
const ZERO_DECIMAL = new Set(["BIF", "CLP", "DJF", "GNF", "ISK", "JPY", "KMF", "KRW", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF"]);
const THREE_DECIMAL = new Set(["BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"]);

/** Decimal places of a currency's smallest unit: 0 (JPY), 3 (KWD) or 2 (everything else). */
export function minorExponent(currency: string | null | undefined): 0 | 2 | 3 {
  const c = (currency ?? "").toUpperCase();
  return ZERO_DECIMAL.has(c) ? 0 : THREE_DECIMAL.has(c) ? 3 : 2;
}

/**
 * Whole units -> minor units. Three-decimal currencies are rounded to the nearest 0.01 (a multiple of 10 minor units): Stripe
 * and the banks behind most gateways refuse the last digit, so the amount we record is exactly the amount the gateway charges.
 */
export function toMinorUnits(amount: number, currency: string | null | undefined): number {
  const e = minorExponent(currency);
  const minor = Math.round(amount * 10 ** e);
  return e === 3 ? Math.round(minor / 10) * 10 : minor;
}

/** Minor units -> whole units (for display and for gateways that take decimal amounts). */
export function fromMinorUnits(minor: number, currency: string | null | undefined): number {
  return minor / 10 ** minorExponent(currency);
}

/** Decimal string with exactly the currency's decimals, for gateways that take "10.50" (PayPal, PayU). */
export function toDecimalString(minor: number, currency: string | null | undefined): string {
  return fromMinorUnits(minor, currency).toFixed(minorExponent(currency));
}
