// Plan names and USD prices. Kept apart from lib/plans.ts so client components (the pricing page) can import them without pulling in server code.
import type { PlanId } from "@/lib/planData";

export const PLAN_META: Record<PlanId, { name: string; price: number; annualPrice: number; description: string }> = {
  free: {
    name: "Free",
    price: 0,
    annualPrice: 0,
    description: "Lifetime free — no credit card required",
  },
  starter: {
    name: "Starter",
    price: 2,
    annualPrice: 1,
    description: "Perfect for solo practitioners",
  },
  professional: {
    name: "Pro",
    price: 6,
    annualPrice: 5,
    description: "For growing service businesses",
  },
  business: {
    name: "Business",
    price: 14,
    annualPrice: 12,
    description: "For teams and high-volume businesses",
  },
};
