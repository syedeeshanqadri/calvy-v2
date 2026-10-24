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
    expect(YEARLY_SAVE_BADGE).toBe("Save ~17%");
  });
  it("yearly totals are 12 x the yearly per-month price", () => {
    for (const p of DISPLAY_PLANS) expect(p.yearlyTotal).toBe(p.yearlyPerMonth * 12);
  });
  it("advertised limits match what is enforced", () => {
    expect(DISPLAY_PLANS[0].features).toContain("Up to 60 appointments/month");
    expect(getLimits("free").maxMonthlyAppointments).toBe(60);
    expect(DISPLAY_PLANS[1].features).toContain("Up to 300 appointments/month");
    expect(getLimits("professional").maxMonthlyAppointments).toBe(300);
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
