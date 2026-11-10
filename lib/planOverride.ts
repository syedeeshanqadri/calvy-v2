import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Calvy admin plan override. While it is set the business's `plan`/`planStatus` ARE the override (so every reader, in every
 * file, already sees it), and `planOverrideFromPlan/Status` remember what to go back to. At the end date the original is put
 * back: by the cron (every couple of minutes) and, as a safety net, whenever a business's features are resolved.
 */
export function overrideExpired(b: { planOverrideUntil?: Date | null; planOverridePlan?: string | null }, now: Date): boolean {
  return !!b.planOverridePlan && !!b.planOverrideUntil && b.planOverrideUntil.getTime() <= now.getTime();
}

/** Put the original plan back on every business whose override has ended. Returns how many were reverted. */
export async function expirePlanOverrides(db: Db, now: Date = new Date(), businessId?: string): Promise<number> {
  const due = await db.business.findMany({
    where: { planOverridePlan: { not: null }, planOverrideUntil: { lte: now }, ...(businessId ? { id: businessId } : {}) },
    select: { id: true, planOverrideFromPlan: true, planOverrideFromStatus: true },
  });
  let n = 0;
  for (const b of due) {
    const r = await db.business.updateMany({
      where: { id: b.id, planOverridePlan: { not: null }, planOverrideUntil: { lte: now } },
      data: { plan: b.planOverrideFromPlan ?? "free", planStatus: b.planOverrideFromStatus ?? "free", planOverridePlan: null, planOverrideUntil: null, planOverrideFromPlan: null, planOverrideFromStatus: null },
    });
    n += r.count;
  }
  return n;
}
