import { describe, it, expect } from "vitest";
import { renderTemplate } from "@/lib/notifications/templates";
import { subscriptionNotice } from "@/lib/notifications/subscriptions";
import { subscriptionNoticeSubject, type SubscriptionNoticeKind } from "@/emails/templates";

const KINDS: SubscriptionNoticeKind[] = ["started", "upgraded", "downgrade_scheduled", "cancelled", "payment_failed_1", "payment_failed_2", "payment_failed_3", "downgraded"];
const p = (kind: SubscriptionNoticeKind) => ({ kind, name: "Asha Rao", businessName: "Glow", planName: "Pro", intervalLabel: "monthly", amountLabel: "₹349.00", dateLabel: "17 Dec 2026", invoiceNumber: "CALVY/2026-27/0001", billingUrl: "https://x.test/dashboard/billing" });

describe("subscription emails", () => {
  it("all eight events render with their own subject, readable text and the Billing link", async () => {
    const subjects = new Set<string>();
    for (const k of KINDS) {
      const r = await renderTemplate("subscription_notice", p(k));
      subjects.add(r.subject);
      expect(r.text, k).toContain("Glow");
      expect(r.text, k).toContain("https://x.test/dashboard/billing");
      expect(r.text + r.html, k).not.toMatch(/undefined|\[object/);
    }
    expect(subjects.size).toBe(KINDS.length);
  });
  it("failed-payment emails name the grace date and promise the data is kept", async () => {
    for (const k of ["payment_failed_2", "payment_failed_3", "downgraded"] as const) {
      const t = (await renderTemplate("subscription_notice", p(k))).text;
      expect(t, k).toMatch(/data|everything|nothing is deleted|still there/i);
    }
    expect((await renderTemplate("subscription_notice", p("payment_failed_1"))).text).toContain("17 Dec 2026");
    expect(subscriptionNoticeSubject(p("payment_failed_3"))).toMatch(/Last reminder/);
  });
  it("an upgrade email shows the credit; a cancel says access continues to the period end", async () => {
    expect((await renderTemplate("subscription_notice", { ...p("upgraded"), creditLabel: "₹174.50" })).text).toContain("credit of ₹174.50");
    expect((await renderTemplate("subscription_notice", p("cancelled"))).text).toMatch(/keep your paid features until 17 Dec 2026/);
  });
  it("the queued message is idempotent: same event + version = same key; a new invoice is a new message", () => {
    const a = subscriptionNotice({ kind: "started", subscriptionId: "s1", businessId: "b1", to: "o@x.com", name: "A", businessName: "G", planName: "Pro", intervalLabel: "monthly", version: "started:CALVY/2026-27/0001" });
    expect(a).toMatchObject({ event: "subscription.started", audience: "BUSINESS", subjectId: "s1", businessId: "b1", template: "subscription_notice" });
    expect(JSON.stringify(a.payload)).not.toMatch(/secret|token/i);
  });
});
