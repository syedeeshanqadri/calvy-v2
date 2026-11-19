import { describe, it, expect } from "vitest";
import { planFeatures, plansWith, planName, parsePlanParam, planQuery, SHOWN_PLANS, type CopyRegion } from "@/lib/planCopy";
import { PLAN_LIMITS, limitsForRegion } from "@/lib/planData";
import { REGION_PRICING, isFeatureHeading } from "@/lib/pricing";

const regions: CopyRegion[] = ["IN", "INTL"];
const norm = (f: string) => f.toLowerCase().replace(/[^a-z]/g, "");

describe("plan copy: one source of truth", () => {
  it("uses the names Free / Pro / Business", () => {
    expect(SHOWN_PLANS.map(planName)).toEqual(["Free", "Pro", "Business"]);
    for (const r of regions) expect(REGION_PRICING[r].plans.map((p) => p.name)).toEqual(["Free", "Pro", "Business"]);
  });
  it("lists no feature twice across the tiers, and WhatsApp appears once", () => {
    for (const r of regions) {
      const all = SHOWN_PLANS.flatMap((p) => planFeatures(p, r).filter((f) => !isFeatureHeading(f)));
      const feats = all.filter((f) => !/^(Up to|Unlimited|1 staff)/.test(f));
      expect(new Set(feats.map(norm)).size, `${r} repeats a feature`).toBe(feats.length);
      expect(all.filter((f) => /whatsapp/i.test(f))).toHaveLength(1);
    }
  });
  it("no vague placeholder, every tier line is a real feature", () => {
    for (const r of regions) for (const p of SHOWN_PLANS) expect(planFeatures(p, r).join("|")).not.toMatch(/Custom business options/);
    expect(planFeatures("business", "INTL")).toEqual(expect.arrayContaining(["Group bookings", "Client broadcasts", "Custom slot lengths", "Priority support"]));
  });
  it("Pro is 2,000 appointments a month everywhere", () => {
    expect(PLAN_LIMITS.professional.maxMonthlyAppointments).toBe(2000);
    for (const r of regions) expect(planFeatures("professional", r)).toContain("Up to 2,000 appointments/month");
  });
  it("Free copy matches the real Free limit of each region: India unlimited, international 60", () => {
    expect(planFeatures("free", "IN")).toContain("Unlimited appointments");
    expect(planFeatures("free", "IN").join("|")).not.toMatch(/60 appointments/);
    expect(planFeatures("free", "INTL")).toContain("Up to 60 appointments/month");
    expect(limitsForRegion(PLAN_LIMITS.free, "free", "IN").maxMonthlyAppointments).toBe(-1);
    expect(limitsForRegion(PLAN_LIMITS.free, "free", "INTL").maxMonthlyAppointments).toBe(60);
    expect(limitsForRegion(PLAN_LIMITS.professional, "professional", "IN").maxMonthlyAppointments).toBe(2000);
  });
  it("upgrade prompts name the plans that really include a feature", () => {
    expect(plansWith("whatsappReminders")).toBe("Pro and Business");
    expect(plansWith("broadcasts")).toBe("Business");
    expect(plansWith("emailReminders")).toBe("Free, Pro and Business");
  });
  it("?plan= parses pro / business and rejects the rest", () => {
    expect(parsePlanParam("pro")).toBe("professional");
    expect(parsePlanParam("Business")).toBe("business");
    expect(parsePlanParam("free")).toBeNull();
    expect(parsePlanParam(undefined)).toBeNull();
    expect(planQuery("professional")).toBe("pro");
  });
});

import { upgradeBannerPlan } from "@/lib/upgradeBanner";
describe("upgrade banner", () => {
  const b = { plan: "free", intendedPlan: "professional", upgradeBannerDismissedAt: null as Date | null };
  it("shows the plan picked in onboarding while still on Free", () => {
    expect(upgradeBannerPlan(b)).toBe("professional");
    expect(upgradeBannerPlan({ ...b, intendedPlan: "business" })).toBe("business");
  });
  it("hides once dismissed, upgraded, or when Free was chosen", () => {
    expect(upgradeBannerPlan({ ...b, upgradeBannerDismissedAt: new Date() })).toBeNull();
    expect(upgradeBannerPlan({ ...b, plan: "professional" })).toBeNull();
    expect(upgradeBannerPlan({ ...b, plan: "business" })).toBeNull();
    expect(upgradeBannerPlan({ ...b, intendedPlan: "free" })).toBeNull();
    expect(upgradeBannerPlan({ ...b, intendedPlan: null })).toBeNull();
  });
});
