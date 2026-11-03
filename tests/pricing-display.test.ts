import { describe, it, expect } from "vitest";
import { DISPLAY_PLANS, isFeatureHeading, PRICING_NOTE, YEARLY_SAVE_BADGE } from "@/lib/pricingDisplay";
import { getLimits } from "@/lib/plans";
import { SUPPORT_EMAIL } from "@/lib/site";

describe("pricing display", () => {
  it("shows Free / Pro / Business with the agreed prices", () => {
    expect(DISPLAY_PLANS.map((p) => [p.name, p.monthly, p.yearlyPerMonth, p.yearlyTotal])).toEqual([
      ["Free", 0, 0, 0],
      ["Pro", 6, 5, 60],
      ["Business", 14, 12, 144],
    ]);
    expect(PRICING_NOTE).toMatch(/no per-staff fees/);
    expect(YEARLY_SAVE_BADGE).toBe("Save up to 17%");
  });
  it("yearly totals are 12 x the yearly per-month price", () => {
    for (const p of DISPLAY_PLANS) expect(p.yearlyTotal).toBe(p.yearlyPerMonth * 12);
  });
  it("advertised limits match what is enforced", () => {
    expect(DISPLAY_PLANS[0].features).toContain("Up to 60 appointments/month");
    expect(getLimits("free").maxMonthlyAppointments).toBe(60);
    expect(DISPLAY_PLANS[1].features).toContain("Up to 1,000 appointments/month");
    expect(getLimits("professional").maxMonthlyAppointments).toBe(1000);
    expect(DISPLAY_PLANS[1].features).toContain("Up to 3 staff");
    expect(getLimits("professional").maxStaff).toBe(3);
  });
  it("'Everything in …, plus:' lines are headings", () => {
    expect(DISPLAY_PLANS[1].features.filter(isFeatureHeading)).toEqual(["Everything in Free, plus:"]);
    expect(DISPLAY_PLANS[2].features.filter(isFeatureHeading)).toEqual(["Everything in Pro, plus:"]);
  });
  it("no trial wording, and one support address constant", () => {
    expect(JSON.stringify(DISPLAY_PLANS)).not.toMatch(/trial/i);
    expect(SUPPORT_EMAIL).toBe("qadri.eeshan@gmail.com");
  });
});

import { signupSchema } from "@/lib/validation/public";

describe("sign-up asks only for the essentials", () => {
  const base = { name: "Jo", email: "jo@x.test", packId: "SALON_SPA" };
  it("India needs a phone number, other regions do not, and the type is required", () => {
    expect(signupSchema.safeParse({ ...base, timezone: "Asia/Kolkata" }).success).toBe(false);
    expect(signupSchema.safeParse({ ...base, timezone: "Asia/Kolkata", phone: "+91 98765 43210" }).success).toBe(true);
    expect(signupSchema.safeParse({ ...base, timezone: "Europe/London" }).success).toBe(true);
    expect(signupSchema.safeParse({ name: "Jo", email: "jo@x.test", timezone: "Europe/London" }).success).toBe(false);
  });
  it("has no password field", () => {
    const r = signupSchema.safeParse({ ...base, timezone: "Europe/London", password: "ignored" });
    expect(r.success && "password" in r.data).toBe(false);
  });
});
