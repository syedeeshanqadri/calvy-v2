import { describe, it, expect } from "vitest";
import { planSeed, limitsForRegion, limitsFromConfig, PLAN_LIMITS } from "@/lib/plans";

// A fresh database (the production launch) is filled from planSeed / scripts/sync-plans.ts, which read PLAN_LIMITS.
describe("plan source for a fresh database", () => {
  const seeded = (id: "free" | "professional" | "business") => limitsFromConfig(planSeed(id) as never);
  it("Pro is 2,000 appointments a month", () => {
    expect(seeded("professional").maxMonthlyAppointments).toBe(2000);
  });
  it("Free is 60 a month internationally and unlimited in India", () => {
    expect(limitsForRegion(seeded("free"), "free", "INTL").maxMonthlyAppointments).toBe(60);
    expect(limitsForRegion(seeded("free"), "free", "IN").maxMonthlyAppointments).toBe(-1);
  });
  it("Business is unlimited", () => {
    expect(seeded("business").maxMonthlyAppointments).toBe(-1);
    expect(PLAN_LIMITS.business.maxMonthlyAppointments).toBe(-1);
  });
});
