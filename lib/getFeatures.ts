import { prisma } from "@/lib/prisma";
import { expirePlanOverrides, overrideExpired } from "@/lib/planOverride";
import { getLimitsFromDB, isActivePlan, type PlanLimits } from "@/lib/plans";

export async function getBusinessFeatures(businessId: string): Promise<PlanLimits> {
  let business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { plan: true, planOverridePlan: true, planOverrideUntil: true },
  });
  // Safety net: an admin plan override that has ended is undone here too, so a late cron never leaves extra features on.
  if (business && overrideExpired(business, new Date())) {
    await expirePlanOverrides(prisma, new Date(), businessId);
    business = await prisma.business.findUnique({ where: { id: businessId }, select: { plan: true, planOverridePlan: true, planOverrideUntil: true } });
  }
  return getLimitsFromDB(business?.plan ?? "free");
}

/**
 * Limits that apply to a business right now. An expired or past-due plan is not
 * a hard stop for public bookings: it falls back to the Free plan limits
 * (read from the same PlanConfig table).
 */
export async function getEffectiveLimits(business: {
  plan: string;
  planStatus: string;
  trialEndsAt?: Date | null;
}): Promise<PlanLimits> {
  return getLimitsFromDB(isActivePlan(business.planStatus, business.plan, business.trialEndsAt) ? business.plan : "free");
}
