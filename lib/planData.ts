// Pure plan data (types and the limits matrix): safe to import from client components. lib/plans.ts re-exports it and adds the server logic.
export type PlanId = "free" | "starter" | "professional" | "business";

export interface PlanLimits {
  maxStaff: number;              // -1 = unlimited
  maxServices: number;
  maxMonthlyAppointments: number;
  maxBroadcastsPerMonth: number; // -1 = unlimited, 0 = disabled
  maxTeamMembers: number;        // team logins besides the owner; -1 = unlimited, 0 = owner only
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
  /** Offers & discounts: business coupons and business-funded offers (paid plans). */
  offers: boolean;
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
    maxTeamMembers: 0,
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
    offers: false,
    customSlotInterval: false,
    removeBranding: false,
    prioritySupport: false,
  },
  starter: {
    maxStaff: 2,
    maxServices: 5,
    maxMonthlyAppointments: 100,
    maxBroadcastsPerMonth: 0,
    maxTeamMembers: 0,
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
    offers: false,
    customSlotInterval: true,
    removeBranding: false,
    prioritySupport: false,
  },
  professional: {
    maxStaff: 3,
    maxServices: -1,
    maxMonthlyAppointments: 2000,
    maxBroadcastsPerMonth: 0,
    maxTeamMembers: 3,
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
    offers: true,
    customSlotInterval: false,
    removeBranding: false,
    prioritySupport: false,
  },
  business: {
    maxStaff: -1,
    maxServices: -1,
    maxMonthlyAppointments: -1,
    maxBroadcastsPerMonth: -1,
    maxTeamMembers: 10,
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
    offers: true,
    customSlotInterval: true,
    removeBranding: true,
    prioritySupport: true,
  },
};
