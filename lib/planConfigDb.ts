import { prisma } from "@/lib/prisma";
import { planSeed, type PlanId } from "@/lib/plans";

export const PLAN_IDS: readonly PlanId[] = ["free", "starter", "professional", "business"];

/**
 * Every plan row, creating any that is missing from the code defaults (the defaults are used ONLY
 * for this seeding). After this, limits and flags are read from the database everywhere.
 */
export async function ensureSeededPlans() {
  const existing = await prisma.planConfig.findMany();
  const have = new Set(existing.map((p) => p.planId));
  const missing = PLAN_IDS.filter((id) => !have.has(id));
  if (missing.length === 0) return existing;
  await prisma.planConfig.createMany({ data: missing.map(planSeed), skipDuplicates: true });
  return prisma.planConfig.findMany({ orderBy: { planId: "asc" } });
}
