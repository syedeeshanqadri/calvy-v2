import { describe, it, expect } from "vitest";
import { REGION_PRICING } from "@/lib/pricing";
import {
  GRACE_DAYS, MIN_AUTH_MINOR, NO_AFA_LIMIT_MINOR, addInterval, classifyChange, desiredPlan, dunningDue, financialYear, graceEnd, invoiceLines, invoiceNumber,
  mandateCheck, overrideActive, planAmountMinor, plansAboveNoAfaLimit, proratedCreditMinor, quoteUpgrade, retryDue,
} from "@/lib/subscriptions/rules";

const D = (s: string) => new Date(s);
const DAY = 86_400_000;

describe("prices come from the rupee price list, never hard-coded", () => {
  it("monthly and yearly paise match lib/pricing.ts", () => {
    for (const id of ["professional", "business"] as const) {
      const p = REGION_PRICING.IN.plans.find((x) => x.id === id)!;
      expect(planAmountMinor(id, "MONTHLY")).toBe(p.monthly * 100);
      expect(planAmountMinor(id, "YEARLY")).toBe(p.yearlyTotal * 100);
    }
  });
});

describe("plan changes", () => {
  it("classifies new / upgrade / downgrade / same / interval switches", () => {
    expect(classifyChange(null, { planId: "professional", interval: "MONTHLY" })).toBe("new");
    expect(classifyChange({ planId: "free", interval: "MONTHLY" }, { planId: "business", interval: "YEARLY" })).toBe("new");
    expect(classifyChange({ planId: "professional", interval: "MONTHLY" }, { planId: "business", interval: "MONTHLY" })).toBe("upgrade");
    expect(classifyChange({ planId: "business", interval: "YEARLY" }, { planId: "professional", interval: "YEARLY" })).toBe("downgrade");
    expect(classifyChange({ planId: "professional", interval: "MONTHLY" }, { planId: "professional", interval: "MONTHLY" })).toBe("same");
    expect(classifyChange({ planId: "professional", interval: "MONTHLY" }, { planId: "professional", interval: "YEARLY" })).toBe("upgrade");
    expect(classifyChange({ planId: "professional", interval: "YEARLY" }, { planId: "professional", interval: "MONTHLY" })).toBe("downgrade");
  });
});

describe("billing periods", () => {
  it("add whole months and years without drifting; a 31st clamps to the month's last day", () => {
    expect(addInterval(D("2026-01-31T10:00:00Z"), "MONTHLY").toISOString()).toBe("2026-02-28T10:00:00.000Z");
    expect(addInterval(D("2028-01-31T10:00:00Z"), "MONTHLY").toISOString()).toBe("2028-02-29T10:00:00.000Z");
    expect(addInterval(D("2026-11-17T08:00:00Z"), "MONTHLY").toISOString()).toBe("2026-12-17T08:00:00.000Z");
    expect(addInterval(D("2026-12-31T08:00:00Z"), "MONTHLY").toISOString()).toBe("2027-01-31T08:00:00.000Z");
    expect(addInterval(D("2028-02-29T08:00:00Z"), "YEARLY").toISOString()).toBe("2029-02-28T08:00:00.000Z");
  });
});

describe("upgrade proration (paise, in the customer's favour by at most 1 paisa)", () => {
  const start = D("2026-11-01T00:00:00Z"), end = D("2026-12-01T00:00:00Z"); // 30 days
  it("half the period left credits half the price", () => {
    expect(proratedCreditMinor({ paidMinor: 34900, periodStart: start, periodEnd: end, now: D("2026-11-16T00:00:00Z") })).toBe(17450);
  });
  it("rounds UP, never more than 1 paisa above the exact value", () => {
    for (const hours of [1, 7, 100, 333, 500, 700]) {
      const now = new Date(start.getTime() + hours * 3_600_000);
      const paid = 34900;
      const exact = (paid * (end.getTime() - now.getTime())) / (end.getTime() - start.getTime());
      const c = proratedCreditMinor({ paidMinor: paid, periodStart: start, periodEnd: end, now });
      expect(c).toBeGreaterThanOrEqual(exact);
      expect(c - exact).toBeLessThan(1);
    }
  });
  it("is zero at/after the end, before nothing was paid, and never above what was paid", () => {
    expect(proratedCreditMinor({ paidMinor: 34900, periodStart: start, periodEnd: end, now: end })).toBe(0);
    expect(proratedCreditMinor({ paidMinor: 0, periodStart: start, periodEnd: end, now: start })).toBe(0);
    expect(proratedCreditMinor({ paidMinor: 34900, periodStart: start, periodEnd: end, now: D("2026-10-20T00:00:00Z") })).toBe(34900);
  });
  it("the quote subtracts the credit and keeps at least Rs 1 to authorise the mandate", () => {
    const q = quoteUpgrade({ newAmountMinor: 79900, credit: { paidMinor: 34900, periodStart: start, periodEnd: end }, now: D("2026-11-16T00:00:00Z") });
    expect(q).toEqual({ grossMinor: 79900, creditMinor: 17450, dueMinor: 62450 });
    const big = quoteUpgrade({ newAmountMinor: 20000, credit: { paidMinor: 99999, periodStart: start, periodEnd: end }, now: start });
    expect(big.dueMinor).toBe(MIN_AUTH_MINOR);
    expect(quoteUpgrade({ newAmountMinor: 79900, credit: null, now: start }).creditMinor).toBe(0);
  });
});

describe("UPI Autopay / e-mandate limit (Rs 15,000 per debit without extra authentication)", () => {
  it("flags amounts above the limit and explains the extra step", () => {
    expect(mandateCheck(NO_AFA_LIMIT_MINOR).needsExtraAuth).toBe(false);
    const over = mandateCheck(NO_AFA_LIMIT_MINOR + 1);
    expect(over.needsExtraAuth).toBe(true);
    expect(over.note).toMatch(/extra authentication/);
  });
  it("REPORT: no current plan exceeds Rs 15,000 (largest yearly price is Rs 8,388)", () => {
    expect(plansAboveNoAfaLimit()).toEqual([]);
    expect(planAmountMinor("business", "YEARLY")).toBeLessThan(NO_AFA_LIMIT_MINOR);
  });
});

describe("invoice numbers (Indian financial year, April to March)", () => {
  it("the FY changes on 1 April IST, not UTC", () => {
    expect(financialYear(D("2027-03-31T18:29:59Z"))).toBe("2026-27"); // 31 Mar 23:59:59 IST
    expect(financialYear(D("2027-03-31T18:30:00Z"))).toBe("2027-28"); // 1 Apr 00:00 IST
    expect(financialYear(D("2026-11-17T10:00:00Z"))).toBe("2026-27");
    expect(financialYear(D("2026-04-01T00:00:00+05:30"))).toBe("2026-27");
    expect(financialYear(D("2026-03-31T12:00:00+05:30"))).toBe("2025-26");
    expect(financialYear(D("2099-06-01T00:00:00Z"))).toBe("2099-00");
  });
  it("numbers are CALVY/<FY>/<4 digits>", () => {
    expect(invoiceNumber("2026-27", 1)).toBe("CALVY/2026-27/0001");
    expect(invoiceNumber("2026-27", 123)).toBe("CALVY/2026-27/0123");
  });
});

describe("GST: a tax invoice only with a GSTIN, otherwise a plain receipt", () => {
  it("with a GSTIN: taxable + GST = total paid; the credit is a line, not part of GST math", () => {
    const l = invoiceLines({ grossMinor: 79900, creditMinor: 17450, gstin: "29ABCDE1234F1Z5", gstRatePercent: 18 });
    expect(l.kind).toBe("TAX_INVOICE");
    expect(l.amountMinor).toBe(62450);
    expect(l.taxableMinor + l.gstMinor).toBe(62450);
    expect(l.gstMinor).toBe(9526);
    expect(l.gstRate).toBe(18);
  });
  it("without a GSTIN: a Receipt, no GST line at all", () => {
    const l = invoiceLines({ grossMinor: 34900, creditMinor: 0, gstin: null, gstRatePercent: 18 });
    expect(l).toMatchObject({ kind: "RECEIPT", amountMinor: 34900, taxableMinor: 34900, gstMinor: 0, gstRate: 0 });
  });
  it("the split always adds up, whatever the amount", () => {
    for (const amt of [100, 101, 34900, 62450, 838800, 99999]) {
      const l = invoiceLines({ grossMinor: amt, creditMinor: 0, gstin: "X", gstRatePercent: 18 });
      expect(l.taxableMinor + l.gstMinor).toBe(amt);
    }
  });
});

describe("failed payments: 7-day grace, dunning on days 0, 3, 6, retries on days 2 and 5", () => {
  const f = D("2026-11-17T00:00:00Z");
  const st = (days: number, dunningSent: number, lastRetry: Date | null = null) => ({ firstFailedAt: f, dunningSent, lastChargeRetryAt: lastRetry, now: new Date(f.getTime() + days * DAY) });
  it("the grace ends 7 days after the first failure", () => {
    expect(GRACE_DAYS).toBe(7);
    expect(graceEnd(f).getTime() - f.getTime()).toBe(7 * DAY);
  });
  it("three dunning emails, in order, each once", () => {
    expect(dunningDue(st(0, 0))).toBe(1);
    expect(dunningDue(st(1, 1))).toBeNull();
    expect(dunningDue(st(3, 1))).toBe(2);
    expect(dunningDue(st(5, 2))).toBeNull();
    expect(dunningDue(st(6, 2))).toBe(3);
    expect(dunningDue(st(8, 3))).toBeNull();
    expect(dunningDue(st(9, 0))).toBe(1); // a missed run catches up in order
  });
  it("retries once on day 2 and once on day 5", () => {
    expect(retryDue(st(1, 1))).toBe(false);
    expect(retryDue(st(2, 1))).toBe(true);
    expect(retryDue(st(2.5, 1, new Date(f.getTime() + 2 * DAY)))).toBe(false);
    expect(retryDue(st(5, 2, new Date(f.getTime() + 2 * DAY)))).toBe(true);
    expect(retryDue(st(6, 2, new Date(f.getTime() + 5 * DAY)))).toBe(false);
  });
});

describe("which plan the subscription gives the business", () => {
  const now = D("2026-11-20T00:00:00Z");
  const base = { planId: "professional", currentPeriodEnd: D("2026-12-01T00:00:00Z"), graceUntil: null as Date | null };
  it("pending and authorised-only subscriptions never change the plan", () => {
    expect(desiredPlan({ ...base, state: "PENDING" }, now)).toBeNull();
    expect(desiredPlan({ ...base, state: "AUTHORISED" }, now)).toBeNull();
  });
  it("active gives its plan", () => {
    expect(desiredPlan({ ...base, state: "ACTIVE" }, now)).toEqual({ plan: "professional", planStatus: "active" });
  });
  it("past due keeps the plan during the grace, then Basic", () => {
    expect(desiredPlan({ ...base, state: "PAST_DUE", graceUntil: D("2026-11-25T00:00:00Z") }, now)).toEqual({ plan: "professional", planStatus: "active" });
    expect(desiredPlan({ ...base, state: "PAST_DUE", graceUntil: D("2026-11-19T00:00:00Z") }, now)).toEqual({ plan: "free", planStatus: "free" });
  });
  it("cancelled keeps access to the end of the paid period, then Basic", () => {
    expect(desiredPlan({ ...base, state: "ENDED" }, now)).toEqual({ plan: "professional", planStatus: "active" });
    expect(desiredPlan({ ...base, state: "ENDED" }, D("2026-12-02T00:00:00Z"))).toEqual({ plan: "free", planStatus: "free" });
    expect(desiredPlan({ ...base, state: "ENDED", currentPeriodEnd: null }, now)).toEqual({ plan: "free", planStatus: "free" });
  });
  it("an admin override wins while it is in force (open-ended, or until a future date)", () => {
    expect(overrideActive({ planOverridePlan: "business", planOverrideUntil: null }, now)).toBe(true);
    expect(overrideActive({ planOverridePlan: "business", planOverrideUntil: D("2026-12-01T00:00:00Z") }, now)).toBe(true);
    expect(overrideActive({ planOverridePlan: "business", planOverrideUntil: D("2026-11-01T00:00:00Z") }, now)).toBe(false);
    expect(overrideActive({ planOverridePlan: null, planOverrideUntil: null }, now)).toBe(false);
  });
});
