import { isPlanEnforcementOn } from "@/lib/flags";

export type PlanId = "free" | "starter" | "professional" | "business";

export interface PlanLimits {
  maxStaff: number;              // -1 = unlimited
  maxServices: number;
  maxMonthlyAppointments: number;
  maxBroadcastsPerMonth: number; // -1 = unlimited, 0 = disabled
  platformFeeMinorIN: number;    // Calvy fee per public online booking in India, paise (0 = none)
  // Feature flags
  analytics: boolean;
  customBranding: boolean;
  imageUpload: boolean;
  seoControls: boolean;
  chatbotWidget: boolean;
  groupBooking: boolean;
  multiService: boolean;
  stripePayments: boolean;
  emailReminders: boolean;
  whatsappReminders: boolean;
  broadcasts: boolean;
  csvExport: boolean;
  expenseTracking: boolean;
  wallet: boolean;
  customSlotInterval: boolean;
  removeBranding: boolean;
  prioritySupport: boolean;
}

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  free: {
    maxStaff: 1,
    maxServices: 3,
    maxMonthlyAppointments: 60,
    maxBroadcastsPerMonth: 0,
    platformFeeMinorIN: 1000,
    analytics: false,
    customBranding: false,
    imageUpload: false,
    seoControls: false,
    chatbotWidget: false,
    groupBooking: false,
    multiService: true,
    stripePayments: false,
    emailReminders: true, // Free: email confirmations and reminders; only WhatsApp is a paid feature
    whatsappReminders: false,
    broadcasts: false,
    csvExport: false,
    expenseTracking: true,
    wallet: false,
    customSlotInterval: false,
    removeBranding: false,
    prioritySupport: false,
  },
  starter: {
    maxStaff: 2,
    maxServices: 5,
    maxMonthlyAppointments: 100,
    maxBroadcastsPerMonth: 0,
    platformFeeMinorIN: 0,
    analytics: false,
    customBranding: true,
    imageUpload: true,
    seoControls: true,
    chatbotWidget: false,
    groupBooking: false,
    multiService: true,
    stripePayments: false,
    emailReminders: true,
    whatsappReminders: false,
    broadcasts: false,
    csvExport: true,
    expenseTracking: true,
    wallet: false,
    customSlotInterval: true,
    removeBranding: false,
    prioritySupport: false,
  },
  professional: {
    maxStaff: 3,
    maxServices: -1,
    maxMonthlyAppointments: 1000,
    maxBroadcastsPerMonth: 0,
    platformFeeMinorIN: 0,
    analytics: true,
    customBranding: true,
    imageUpload: true,
    seoControls: true,
    chatbotWidget: false,
    groupBooking: false,
    multiService: true,
    stripePayments: true,
    emailReminders: true,
    whatsappReminders: true,
    broadcasts: false,
    csvExport: true,
    expenseTracking: true,
    wallet: true,
    customSlotInterval: false,
    removeBranding: false,
    prioritySupport: false,
  },
  business: {
    maxStaff: -1,
    maxServices: -1,
    maxMonthlyAppointments: -1,
    maxBroadcastsPerMonth: -1,
    platformFeeMinorIN: 0,
    analytics: true,
    customBranding: true,
    imageUpload: true,
    seoControls: true,
    chatbotWidget: true,
    groupBooking: true,
    multiService: true,
    stripePayments: true,
    emailReminders: true,
    whatsappReminders: true,
    broadcasts: true,
    csvExport: true,
    expenseTracking: true,
    wallet: true,
    customSlotInterval: true,
    removeBranding: true,
    prioritySupport: true,
  },
};

export const PLAN_META: Record<PlanId, { name: string; price: number; annualPrice: number; description: string; planIdEnvKey: string; annualPlanIdEnvKey: string }> = {
  free: {
    name: "Free",
    price: 0,
    annualPrice: 0,
    description: "Lifetime free — no credit card required",
    planIdEnvKey: "",
    annualPlanIdEnvKey: "",
  },
  starter: {
    name: "Starter",
    price: 2,
    annualPrice: 1,
    description: "Perfect for solo practitioners",
    planIdEnvKey: "RAZORPAY_PLAN_STARTER",
    annualPlanIdEnvKey: "RAZORPAY_PLAN_STARTER_ANNUAL",
  },
  professional: {
    name: "Pro",
    price: 6,
    annualPrice: 5,
    description: "For growing service businesses",
    planIdEnvKey: "RAZORPAY_PLAN_PROFESSIONAL",
    annualPlanIdEnvKey: "RAZORPAY_PLAN_PROFESSIONAL_ANNUAL",
  },
  business: {
    name: "Business",
    price: 14,
    annualPrice: 12,
    description: "For teams and high-volume businesses",
    planIdEnvKey: "RAZORPAY_PLAN_BUSINESS",
    annualPlanIdEnvKey: "RAZORPAY_PLAN_BUSINESS_ANNUAL",
  },
};

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
  maxStaff: number; maxServices: number; maxMonthlyAppointments: number; maxBroadcastsPerMonth: number; platformFeeMinorIN: number;
  analytics: boolean; customBranding: boolean; imageUpload: boolean; seoControls: boolean; chatbotWidget: boolean;
  groupBooking: boolean; multiService: boolean; stripePayments: boolean; emailReminders: boolean; smsReminders: boolean;
  broadcasts: boolean; csvExport: boolean; expenseTracking: boolean; wallet: boolean; customSlotInterval: boolean;
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

export async function getLimitsFromDB(plan: string): Promise<PlanLimits> {
  try {
    const { prisma } = await import("@/lib/prisma");
    const config = await prisma.planConfig.findUnique({ where: { planId: normalizePlanId(plan) } });
    return config ? applyEnforcement(limitsFromConfig(config)) : getLimits(plan);
  } catch {
    return getLimits(plan);
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

export function getRazorpayPlanId(plan: PlanId, interval: "monthly" | "annual" = "monthly"): string | null {
  const meta = PLAN_META[plan];
  if (!meta) return null;
  const key = interval === "annual" ? meta.annualPlanIdEnvKey : meta.planIdEnvKey;
  if (!key) return null;
  return process.env[key] ?? null;
}
