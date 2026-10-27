/**
 * Signup asks for the country or region only. The currency follows from it here (server side), so
 * owners never choose one. Codes are ISO 3166 alpha-2; "EU" stands for the euro area.
 */
export interface Region { code: string; name: string; currency: string }

export const REGIONS: Region[] = [
  { code: "IN", name: "India", currency: "INR" },
  { code: "US", name: "United States", currency: "USD" },
  { code: "GB", name: "United Kingdom", currency: "GBP" },
  { code: "CA", name: "Canada", currency: "CAD" },
  { code: "AU", name: "Australia", currency: "AUD" },
  { code: "NZ", name: "New Zealand", currency: "NZD" },
  { code: "EU", name: "Europe (euro area)", currency: "EUR" },
  { code: "AE", name: "United Arab Emirates", currency: "AED" },
  { code: "SA", name: "Saudi Arabia", currency: "SAR" },
  { code: "PK", name: "Pakistan", currency: "PKR" },
  { code: "BD", name: "Bangladesh", currency: "BDT" },
  { code: "MY", name: "Malaysia", currency: "MYR" },
  { code: "SG", name: "Singapore", currency: "SGD" },
  { code: "NG", name: "Nigeria", currency: "NGN" },
  { code: "ZA", name: "South Africa", currency: "ZAR" },
];

export const REGION_CODES = REGIONS.map((r) => r.code) as [string, ...string[]];

export function currencyForRegion(code: string | null | undefined): string | null {
  return REGIONS.find((r) => r.code === code)?.currency ?? null;
}
