export type PlanId = "free" | "starter" | "professional" | "business";

export interface PlanLimits {
  maxStaff: number;              // -1 = unlimited
  maxServices: number;
  maxMonthlyAppointments: number;
  maxBroadcastsPerMonth: number; // -1 = unlimited, 0 = disabled
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
    analytics: false,
    customBranding: false,
    imageUpload: false,
    seoControls: false,
    chatbotWidget: false,
    groupBooking: false,
    multiService: true,
    stripePayments: false,
    emailReminders: false,
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

export function getLimits(plan: string): PlanLimits {
  return PLAN_LIMITS[normalizePlanId(plan)];
}

export async function getLimitsFromDB(plan: string): Promise<PlanLimits> {
  try {
    const { prisma } = await import("@/lib/prisma");
    const planKey = normalizePlanId(plan);
    const config = await prisma.planConfig.findUnique({ where: { planId: planKey } });
    if (!config) return getLimits(plan);
    return {
      maxStaff: config.maxStaff,
      maxServices: config.maxServices,
      maxMonthlyAppointments: config.maxMonthlyAppointments,
      maxBroadcastsPerMonth: config.maxBroadcastsPerMonth,
      analytics: config.analytics,
      customBranding: config.customBranding,
      imageUpload: config.imageUpload,
      seoControls: config.seoControls,
      chatbotWidget: config.chatbotWidget,
      groupBooking: config.groupBooking,
      multiService: config.multiService,
      stripePayments: config.stripePayments,
      emailReminders: config.emailReminders,
      whatsappReminders: config.smsReminders,
      broadcasts: config.broadcasts,
      csvExport: config.csvExport,
      expenseTracking: config.expenseTracking,
      wallet: config.wallet,
      customSlotInterval: config.customSlotInterval,
      removeBranding: config.removeBranding,
      prioritySupport: config.prioritySupport,
    };
  } catch {
    return getLimits(plan);
  }
}

export function isActivePlan(planStatus: string, plan: string, trialEndsAt: Date | null | undefined): boolean {
  // Free plan always active — lifetime, no expiry
  if (normalizePlanId(plan) === "free") return true;
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
