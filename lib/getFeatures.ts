import { prisma } from "@/lib/prisma";
import { expirePlanOverrides, overrideExpired } from "@/lib/planOverride";
import { getLimitsFromDB, isActivePlan, type PlanLimits } from "@/lib/plans";
import { regionOf } from "@/lib/payments/region";
import { cache } from "react";
import { getBusinessCore } from "@/lib/requestCache";

// One PlanConfig read per request per plan and region.
const limitsOnce = cache((plan: string, region: "IN" | "INTL") => getLimitsFromDB(plan, region));

/** The plan limits for a business, read once per request (the business row comes from the shared per-request lookup). */
export const getBusinessFeatures = cache(async (businessId: string): Promise<PlanLimits> => {
  let business: { plan: string; planOverridePlan: string | null; planOverrideUntil: Date | null; currency: string | null } | null = await getBusinessCore(businessId);
  // Safety net: an admin plan override that has ended is undone here too, so a late cron never leaves extra features on.
  if (business && overrideExpired(business, new Date())) {
    await expirePlanOverrides(prisma, new Date(), businessId);
    business = await prisma.business.findUnique({ where: { id: businessId }, select: { plan: true, planOverridePlan: true, planOverrideUntil: true, currency: true } });
  }
  return limitsOnce(business?.plan ?? "free", regionOf({ currency: business?.currency }));
});

/**
 * Limits that apply to a business right now. An expired or past-due plan is not
 * a hard stop for public bookings: it falls back to the Free plan limits
 * (read from the same PlanConfig table).
 */
export async function getEffectiveLimits(business: {
  plan: string;
  planStatus: string;
  trialEndsAt?: Date | null;
  /** Required so the region (India Free is uncapped) is never forgotten. */
  currency: string | null;
}): Promise<PlanLimits> {
  return limitsOnce(isActivePlan(business.planStatus, business.plan, business.trialEndsAt) ? business.plan : "free", regionOf({ currency: business.currency }));
}
