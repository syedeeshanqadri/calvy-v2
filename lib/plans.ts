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
    maxMonthlyAppointments: 30,
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
    maxStaff: 5,
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
    name: "Professional",
    price: 5,
    annualPrice: 2,
    description: "For growing service businesses",
    planIdEnvKey: "RAZORPAY_PLAN_PROFESSIONAL",
    annualPlanIdEnvKey: "RAZORPAY_PLAN_PROFESSIONAL_ANNUAL",
  },
  business: {
    name: "Business",
    price: 10,
    annualPrice: 6,
    description: "For teams and high-volume businesses",
    planIdEnvKey: "RAZORPAY_PLAN_BUSINESS",
    annualPlanIdEnvKey: "RAZORPAY_PLAN_BUSINESS_ANNUAL",
  },
};

export function getLimits(plan: string): PlanLimits {
  if (plan === "trial") return PLAN_LIMITS.free; // legacy compat
  return PLAN_LIMITS[plan as PlanId] ?? PLAN_LIMITS.free;
}

export async function getLimitsFromDB(plan: string): Promise<PlanLimits> {
  try {
    const { prisma } = await import("@/lib/prisma");
    const planKey = plan === "trial" ? "free" : plan;
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
  if (plan === "free" || plan === "trial") return true;
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
