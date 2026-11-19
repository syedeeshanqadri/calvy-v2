import { normalizePlanId } from "@/lib/plans";

/** Which plan the "Complete your upgrade" banner names, or null for no banner: still on Free, picked Pro or Business in onboarding, not dismissed. */
export function upgradeBannerPlan(b: { plan: string | null; intendedPlan: string | null; upgradeBannerDismissedAt: Date | null }): "professional" | "business" | null {
  if (b.upgradeBannerDismissedAt) return null;
  if (normalizePlanId(b.plan) !== "free") return null;
  return b.intendedPlan === "professional" || b.intendedPlan === "business" ? b.intendedPlan : null;
}
