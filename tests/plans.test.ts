import { describe, it, expect } from "vitest";
import { getLimits, isActivePlan, getRazorpayPlanId, normalizePlanId, defaultPlanStatus } from "@/lib/plans";

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

describe("legacy plan mapping", () => {
  it("trial -> free, starter -> professional, current ids unchanged", () => {
    expect(normalizePlanId("trial")).toBe("free");
    expect(normalizePlanId("starter")).toBe("professional");
    expect(normalizePlanId("professional")).toBe("professional");
    expect(normalizePlanId("free")).toBe("free");
    expect(normalizePlanId("business")).toBe("business");
  });
  it("unknown, empty and missing values fall back to free", () => {
    expect(normalizePlanId("enterprise")).toBe("free");
    expect(normalizePlanId("")).toBe("free");
    expect(normalizePlanId(null)).toBe("free");
    expect(normalizePlanId(undefined)).toBe("free");
  });
  it("legacy starter gets Pro limits", () => {
    expect(getLimits("starter")).toEqual(getLimits("professional"));
  });
  it("isActivePlan treats a legacy starter like Pro (needs active status)", () => {
    expect(isActivePlan("active", "starter", null)).toBe(true);
    expect(isActivePlan("past_due", "starter", null)).toBe(false);
  });
  it("defaultPlanStatus: free for free/trial, active for paid", () => {
    expect(defaultPlanStatus("free")).toBe("free");
    expect(defaultPlanStatus("trial")).toBe("free");
    expect(defaultPlanStatus("starter")).toBe("active");
    expect(defaultPlanStatus("professional")).toBe("active");
    expect(defaultPlanStatus("business")).toBe("active");
  });
});
