import { prisma } from "@/lib/prisma";
import { getLimitsFromDB, isActivePlan, type PlanLimits } from "@/lib/plans";

export async function getBusinessFeatures(businessId: string): Promise<PlanLimits> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { plan: true },
  });
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
