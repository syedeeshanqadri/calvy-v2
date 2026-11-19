import { isPlanEnforcementOn } from "@/lib/flags";
import { PLAN_LIMITS, limitsForRegion, type LimitRegion, type PlanId, type PlanLimits } from "@/lib/planData";
export { PLAN_LIMITS, limitsForRegion };
export type { PlanId, PlanLimits };

import { PLAN_META } from "@/lib/planMeta";
export { PLAN_META };

/**
 * Maps any stored plan value to a current plan id (free / professional / business).
 * Legacy values: trial -> free, starter -> professional. Unknown values -> free.
 * The data migration 20261024100000_normalize_plans applies the same mapping to existing rows.
 */
export function normalizePlanId(plan: string | null | undefined): PlanId {
  switch (plan) {
    case "professional":
    case "starter":
      return "professional";
    case "business":
      return "business";
    default:
      return "free"; // free, trial, unknown
  }
}

/** planStatus that matches a plan: "free" for the free plan, "active" for paid plans. */
export function defaultPlanStatus(plan: string | null | undefined): "free" | "active" {
  return normalizePlanId(plan) === "free" ? "free" : "active";
}

/**
 * With PLAN_ENFORCEMENT off, a plan's limits become "no limits and every feature": counts are -1
 * (unlimited) and every flag is true. platformFeeMinorIN stays as the plan defines it, because it
 * is what Calvy charges for an online booking, not a gate. All enforcement code stays in place and
 * behaves as before the moment the flag is on.
 */
export function unlimitedLimits(real: PlanLimits): PlanLimits {
  const out = { ...real } as Record<string, number | boolean>;
  for (const [k, v] of Object.entries(real)) {
    if (k === "platformFeeMinorIN") continue;
    out[k] = typeof v === "number" ? -1 : true;
  }
  return out as unknown as PlanLimits;
}

/** The single choke point: every limit and feature gate reads its limits through here. */
export function applyEnforcement(limits: PlanLimits, on: boolean = isPlanEnforcementOn()): PlanLimits {
  return on ? limits : unlimitedLimits(limits);
}

export function getLimits(plan: string): PlanLimits {
  return applyEnforcement(PLAN_LIMITS[normalizePlanId(plan)]);
}

/** The columns of a PlanConfig row that carry limits and flags (the DB calls the WhatsApp flag smsReminders). */
export interface PlanConfigRow {
  maxStaff: number; maxServices: number; maxMonthlyAppointments: number; maxBroadcastsPerMonth: number; maxTeamMembers: number; platformFeeMinorIN: number;
  analytics: boolean; customBranding: boolean; imageUpload: boolean; seoControls: boolean; chatbotWidget: boolean;
  groupBooking: boolean; multiService: boolean; stripePayments: boolean; emailReminders: boolean; smsReminders: boolean;
  broadcasts: boolean; csvExport: boolean; expenseTracking: boolean; offers: boolean; customSlotInterval: boolean;
  removeBranding: boolean; prioritySupport: boolean;
}

/** The one place a PlanConfig row becomes PlanLimits: the admin screen, billing screen and API checks all use it. */
export function limitsFromConfig(c: PlanConfigRow): PlanLimits {
  const { smsReminders, ...rest } = c;
  return { ...rest, whatsappReminders: smsReminders };
}

/** The inverse, for seeding a missing PlanConfig row from the code defaults (defaults are used ONLY for this). */
export function configFromLimits(l: PlanLimits): PlanConfigRow {
  const { whatsappReminders, ...rest } = l;
  return { ...rest, smsReminders: whatsappReminders };
}

/** Everything needed to create a PlanConfig row for a plan from the code defaults. */
export function planSeed(planId: PlanId) {
  return {
    planId,
    name: PLAN_META[planId].name,
    price: PLAN_META[planId].price,
    annualPrice: PLAN_META[planId].annualPrice,
    description: PLAN_META[planId].description,
    features: "[]",
    ...configFromLimits(PLAN_LIMITS[planId]),
  };
}

/** Limits for a plan from the PlanConfig table. Pass the business's region: India Free has no appointment cap (see limitsForRegion). */
export async function getLimitsFromDB(plan: string, region: LimitRegion): Promise<PlanLimits> {
  const id = normalizePlanId(plan);
  try {
    const { prisma } = await import("@/lib/prisma");
    const config = await prisma.planConfig.findUnique({ where: { planId: id } });
    return limitsForRegion(config ? applyEnforcement(limitsFromConfig(config)) : getLimits(plan), id, region);
  } catch {
    return limitsForRegion(getLimits(plan), id, region);
  }
}

export function isActivePlan(planStatus: string, plan: string, trialEndsAt: Date | null | undefined): boolean {
  // Without enforcement nothing expires; the Free plan is always active (lifetime, no expiry)
  if (!isPlanEnforcementOn() || normalizePlanId(plan) === "free") return true;
  return planStatus === "active";
}

export function trialDaysLeft(_trialEndsAt: Date | null | undefined): number {
  return 0;
}

