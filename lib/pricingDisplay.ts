// USD display plans shown on the dashboard billing page (billing itself is USD).
// The per-region config lives in lib/pricing.ts.

import { REGION_PRICING, PRICING_NOTE, isFeatureHeading, yearlySaveBadge, type DisplayPlan } from "@/lib/pricing";

export type { DisplayPlan };
export { PRICING_NOTE, isFeatureHeading };

export const DISPLAY_PLANS: DisplayPlan[] = REGION_PRICING.INTL.plans;
export const YEARLY_SAVE_BADGE = yearlySaveBadge(DISPLAY_PLANS);

export function displayPlan(id: string): DisplayPlan | undefined {
  return DISPLAY_PLANS.find((p) => p.id === id);
}
