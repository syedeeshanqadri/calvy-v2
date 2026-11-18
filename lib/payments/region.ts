// Which region a business is in decides which gateways it may connect. Pure (no server imports): safe in the browser.
export type PayRegion = "IN" | "INTL";

/**
 * India when the business says so. A stored country wins when the Business model has one (it has none yet), otherwise the
 * currency decides: INR = India, anything else = international.
 */
export function regionOf(b: { country?: string | null; currency?: string | null }): PayRegion {
  const country = (b.country ?? "").trim().toUpperCase();
  if (country) return country === "IN" ? "IN" : "INTL";
  return (b.currency ?? "").trim().toUpperCase() === "INR" ? "IN" : "INTL";
}
