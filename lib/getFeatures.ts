import { prisma } from "@/lib/prisma";
import { getLimitsFromDB, type PlanLimits } from "@/lib/plans";

export async function getBusinessFeatures(businessId: string): Promise<PlanLimits> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { plan: true },
  });
  return getLimitsFromDB(business?.plan ?? "free");
}
