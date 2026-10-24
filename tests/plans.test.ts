import { describe, it, expect } from "vitest";
import { getLimits, isActivePlan, getRazorpayPlanId } from "@/lib/plans";

describe("getLimits", () => {
  it("returns free limits for unknown/free plans", () => {
    expect(getLimits("free").stripePayments).toBe(false);
    expect(getLimits("nonsense").maxStaff).toBe(getLimits("free").maxStaff);
  });

  it("treats legacy 'trial' as free", () => {
    expect(getLimits("trial")).toEqual(getLimits("free"));
  });

  it("grants paid features on higher tiers", () => {
    expect(getLimits("professional").analytics).toBe(true);
    expect(getLimits("business").removeBranding).toBe(true);
  });
});

describe("Free / Pro / Business limits", () => {
  it("Free: 1 staff, 60 appointments/month", () => {
    expect(getLimits("free")).toMatchObject({ maxStaff: 1, maxMonthlyAppointments: 60 });
  });
  it("Pro (professional): 3 staff, 1000 appointments, no chatbot/group/broadcasts/custom slot interval", () => {
    expect(getLimits("professional")).toMatchObject({
      maxStaff: 3, maxMonthlyAppointments: 1000,
      chatbotWidget: false, groupBooking: false, broadcasts: false, customSlotInterval: false,
      analytics: true, customBranding: true, whatsappReminders: true, csvExport: true,
    });
  });
  it("Business: unlimited staff and appointments, every flag on", () => {
    const b = getLimits("business");
    expect(b.maxStaff).toBe(-1);
    expect(b.maxMonthlyAppointments).toBe(-1);
    const flags = Object.entries(b).filter(([, v]) => typeof v === "boolean");
    expect(flags.every(([, v]) => v === true)).toBe(true);
  });
});

describe("isActivePlan", () => {
  it("free/trial are always active regardless of status", () => {
    expect(isActivePlan("free", "free", null)).toBe(true);
    expect(isActivePlan("past_due", "trial", null)).toBe(true);
  });

  it("paid plans require an active status", () => {
    expect(isActivePlan("active", "professional", null)).toBe(true);
    expect(isActivePlan("past_due", "professional", null)).toBe(false);
    expect(isActivePlan("cancelled", "business", null)).toBe(false);
  });
});

describe("getRazorpayPlanId", () => {
  it("returns null for the free plan", () => {
    expect(getRazorpayPlanId("free")).toBeNull();
  });

  it("reads the configured env var for monthly and annual", () => {
    process.env.RAZORPAY_PLAN_STARTER = "plan_monthly_x";
    process.env.RAZORPAY_PLAN_STARTER_ANNUAL = "plan_annual_x";
    expect(getRazorpayPlanId("starter", "monthly")).toBe("plan_monthly_x");
    expect(getRazorpayPlanId("starter", "annual")).toBe("plan_annual_x");
  });

  it("returns null when the env var is unset", () => {
    delete process.env.RAZORPAY_PLAN_BUSINESS;
    expect(getRazorpayPlanId("business", "monthly")).toBeNull();
  });
});
