// Display-only pricing for the marketing site and signup, one config per region.
// International (USD) prices come from PLAN_META in lib/plans.ts; the rupee prices are set here because plans.ts has no INR column.
// Enforcement and billing still read limits and plan ids from PlanConfig and
// lib/plans.ts; the internal id "professional" is shown as "Pro". The legacy
// "starter" plan stays in the database but is not displayed.

import { PLAN_META } from "@/lib/planMeta";

export type Region = "IN" | "INTL";

export interface DisplayPlan {
  id: "free" | "professional" | "business";
  name: string;
  /** Per month when billed monthly, in the region's currency */
  monthly: number;
  /** Per month when billed yearly */
  yearlyPerMonth: number;
  /** Billed once a year */
  yearlyTotal: number;
  description: string;
  features: string[];
  highlight: boolean;
  badge?: string;
}

export interface RegionPricing {
  region: Region;
  currency: "USD" | "INR";
  locale: string;
  /** Optional line above the cards */
  headline?: string;
  plans: DisplayPlan[];
}

export const REGION_COOKIE = "calvy_region";
export const DEFAULT_REGION: Region = "INTL";
export const WHATSAPP_NOTE = "WhatsApp on Pro and Business: message charges are billed by Meta directly to your own WhatsApp Business account.";
export const PRICING_NOTE = "Flat price for your whole team — no per-staff fees.";

// The mobile app is part of Pro and Business in every country; Business unlocks the full feature set.
const MOBILE_APP_PRO = "Mobile app: notifications, check, cancel & reschedule bookings";
const MOBILE_APP_BUSINESS = "Premium mobile app: 40+ features";

const INTL: RegionPricing = {
  region: "INTL",
  currency: "USD",
  locale: "en-US",
  plans: [
    {
      id: "free",
      name: "Free",
      monthly: 0,
      yearlyPerMonth: 0,
      yearlyTotal: 0,
      description: "Free forever, no credit card required",
      features: [
        "1 staff member",
        "Up to 60 appointments/month",
        "Booking page + business website",
        "Email confirmations & reminders",
        "Calendar sync",
        MOBILE_APP_PRO,
      ],
      highlight: false,
    },
    {
      id: "professional",
      name: "Pro",
      monthly: PLAN_META.professional.price,
      yearlyPerMonth: PLAN_META.professional.annualPrice,
      yearlyTotal: PLAN_META.professional.annualPrice * 12,
      description: "For growing service businesses",
      features: [
        "Up to 3 staff",
        "Up to 2,000 appointments/month",
        "Everything in Free, plus:",
        "WhatsApp confirmations & reminders",
        "Custom branding & colours",
        "Analytics dashboard",
        "Image uploads & SEO controls",
        "CSV export & expense tracking",
        "Calendar sync",
        MOBILE_APP_PRO,
      ],
      highlight: false,
    },
    {
      id: "business",
      name: "Business",
      monthly: PLAN_META.business.price,
      yearlyPerMonth: PLAN_META.business.annualPrice,
      yearlyTotal: PLAN_META.business.annualPrice * 12,
      description: "For teams and high-volume businesses",
      features: [
        "Unlimited staff",
        "Unlimited appointments",
        "Everything in Pro, plus:",
        "WhatsApp & email alerts",
        "Calendar sync",
        "Custom business options",
        "Group bookings",
        "Client broadcasts",
        MOBILE_APP_BUSINESS,
        "Remove \"Powered by Calvy\"",
        "Priority support",
      ],
      highlight: true,
      badge: "Most popular",
    },
  ],
};

const IN: RegionPricing = {
  region: "IN",
  currency: "INR",
  locale: "en-IN",
  plans: [
    {
      id: "free",
      name: "Free Forever",
      monthly: 0,
      yearlyPerMonth: 0,
      yearlyTotal: 0,
      description: "No monthly fee, no credit card required",
      features: [
        "Unlimited bookings",
        "A nominal platform fee per confirmed online booking",
        "Booking page + business website",
        "Email notifications",
        "1 staff member",
        "Calendar sync",
        MOBILE_APP_PRO,
      ],
      highlight: false,
    },
    {
      id: "professional",
      name: "Pro",
      monthly: 349,
      yearlyPerMonth: 299,
      yearlyTotal: 3588,
      description: "For growing service businesses",
      features: [
        "No platform fee",
        "Up to 3 staff",
        "Up to 2,000 appointments/month",
        "Everything in Free, plus:",
        "WhatsApp confirmations & reminders",
        "Custom branding & colours",
        "Analytics dashboard",
        "Image uploads & SEO controls",
        "CSV export & expense tracking",
        "Calendar sync",
        MOBILE_APP_PRO,
      ],
      highlight: false,
    },
    {
      id: "business",
      name: "Business",
      monthly: 799,
      yearlyPerMonth: 699,
      yearlyTotal: 8388,
      description: "For teams and high-volume businesses",
      features: [
        "No platform fee",
        "Unlimited staff",
        "Unlimited appointments",
        "Everything in Pro, plus:",
        "Calendar sync",
        "Custom business options",
        "Group bookings",
        "Client broadcasts",
        MOBILE_APP_BUSINESS,
        "Remove \"Powered by Calvy\"",
        "Priority support",
      ],
      highlight: true,
      badge: "Most popular",
    },
  ],
};

export const REGION_PRICING: Record<Region, RegionPricing> = { INTL, IN };

export function getRegionPricing(region: Region): RegionPricing {
  return REGION_PRICING[region];
}

/** Largest yearly saving across the paid plans, as a whole percent, calculated from the config. */
export function yearlySavePercent(plans: DisplayPlan[]): number {
  let best = 0;
  for (const p of plans) {
    if (p.monthly <= 0) continue;
    best = Math.max(best, Math.round((1 - p.yearlyPerMonth / p.monthly) * 100));
  }
  return best;
}

export function yearlySaveBadge(plans: DisplayPlan[]): string {
  return `Save up to ${yearlySavePercent(plans)}%`;
}

export function formatMoney(amount: number, pricing: Pick<RegionPricing, "currency" | "locale">): string {
  return new Intl.NumberFormat(pricing.locale, {
    style: "currency",
    currency: pricing.currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/** "Everything in Free, plus:" lines render as a bold sub-heading, not a check-list item. */
export function isFeatureHeading(feature: string): boolean {
  return /^Everything in .+, plus:$/.test(feature);
}
