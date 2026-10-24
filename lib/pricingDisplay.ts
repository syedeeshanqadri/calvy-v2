// Display-only pricing (USD) shown on the homepage and the dashboard billing page.
// Enforcement and billing still read limits and plan ids from PlanConfig and
// lib/plans.ts; the internal id "professional" is shown as "Pro". The legacy
// "starter" plan stays in the database but is not displayed.

export interface DisplayPlan {
  id: "free" | "professional" | "business";
  name: string;
  /** USD per month when billed monthly */
  monthly: number;
  /** USD per month when billed yearly */
  yearlyPerMonth: number;
  /** USD billed once a year */
  yearlyTotal: number;
  description: string;
  features: string[];
  highlight: boolean;
  badge?: string;
}

export const DISPLAY_PLANS: DisplayPlan[] = [
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
];

export const PRICING_NOTE = "Flat price for your whole team — no per-staff fees.";
export const YEARLY_SAVE_BADGE = "Save ~17%";

/** "Everything in Free, plus:" lines render as a bold sub-heading, not a check-list item. */
export function isFeatureHeading(feature: string): boolean {
  return /^Everything in .+, plus:$/.test(feature);
}

export function displayPlan(id: string): DisplayPlan | undefined {
  return DISPLAY_PLANS.find((p) => p.id === id);
}
