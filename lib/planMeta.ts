// Plan names and USD prices. Kept apart from lib/plans.ts so client components (the pricing page) can import them without pulling in server code.
import type { PlanId } from "@/lib/plans";

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
