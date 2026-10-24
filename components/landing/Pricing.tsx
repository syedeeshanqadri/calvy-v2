import { DISPLAY_PLANS } from "@/lib/pricingDisplay";
import PricingClient from "./PricingClient";

// Marketing prices are display-only (see lib/pricingDisplay.ts); enforcement
// reads the plan table, billing reads the Razorpay plan ids.
export function Pricing() {
  return <PricingClient plans={DISPLAY_PLANS} />;
}
