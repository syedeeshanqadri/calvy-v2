// Display-only pricing for the marketing site and signup, one config per region.
// Enforcement and billing still read limits and plan ids from PlanConfig and
// lib/plans.ts; the internal id "professional" is shown as "Pro". The legacy
// "starter" plan stays in the database but is not displayed.

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
export const PRICING_NOTE = "Flat price for your whole team — no per-staff fees.";

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
      ],
      highlight: false,
    },
    {
      id: "professional",
      name: "Pro",
      monthly: 6,
      yearlyPerMonth: 5,
      yearlyTotal: 60,
      description: "For growing service businesses",
      features: [
        "Up to 3 staff",
        "Up to 300 appointments/month",
        "Everything in Free, plus:",
        "WhatsApp confirmations & reminders",
        "Custom branding & colours",
        "Analytics dashboard",
        "Image uploads & SEO controls",
        "CSV export & expense tracking",
      ],
      highlight: false,
    },
    {
      id: "business",
      name: "Business",
      monthly: 14,
      yearlyPerMonth: 12,
      yearlyTotal: 144,
      description: "For teams and high-volume businesses",
      features: [
        "Unlimited staff",
        "Unlimited appointments",
        "Everything in Pro, plus:",
        "WhatsApp, email & SMS alerts",
        "Calendar sync",
        "Custom business options",
        "Group bookings",
        "Chatbot booking widget",
        "Client broadcasts",
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
  headline: "Free forever. Only ₹10 per confirmed online booking.",
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
        "₹10 platform fee per confirmed online booking — you choose who pays: your business or your customer",
        "Booking page + business website",
        "Email notifications",
        "1 staff member",
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
        "No ₹10 platform fee",
        "Up to 3 staff",
        "Everything in Free, plus:",
        "WhatsApp confirmations & reminders",
        "Custom branding & colours",
        "Analytics dashboard",
        "Image uploads & SEO controls",
        "CSV export & expense tracking",
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
        "No ₹10 platform fee",
        "Unlimited staff",
        "Everything in Pro, plus:",
        "SMS reminders",
        "Calendar sync",
        "Custom business options",
        "Group bookings",
        "Chatbot booking widget",
        "Client broadcasts",
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
