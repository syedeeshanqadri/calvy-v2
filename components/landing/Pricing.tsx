import PricingClient from "./PricingClient";

// Marketing prices are display-only (see lib/pricing.ts); enforcement reads
// the plan table, billing reads the Razorpay plan ids. Server-rendered as
// International; the client swaps to the visitor's region.
export function Pricing() {
  return <PricingClient />;
}
