import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

// International plan billing, end to end against an in-memory database: first payment (with and without a coupon), renewals, idempotency,
// the region guard, the fallback to payment links (never silent), dunning and grace, scheduled changes, "Update card", and the webhook route.

const mem = vi.hoisted(() => ({
  subs: [] as any[], invoices: [] as any[], counters: {} as Record<string, number>, business: {} as Record<string, any>, notices: [] as any[], settings: {} as Record<string, string>,
  events: [] as any[], seq: 0, flag: true, logs: [] as any[], previews: {} as Record<string, any>,
}));
const match = (r: any, w: any = {}): boolean => Object.entries(w).every(([k, v]: [string, any]) => {
  if (k === "NOT" || k === "business") return true;
  if (v && typeof v === "object" && !(v instanceof Date)) {
    if ("in" in v) return v.in.includes(r[k]);
    if ("not" in v) return r[k] !== v.not;
    if ("lte" in v) return r[k] != null && r[k] <= v.lte;
    if ("gte" in v) return r[k] != null && r[k] >= v.gte;
  }
  return r[k] === v;
});
const fake = vi.hoisted(() => ({} as any));
Object.assign(fake, {
  subscription: {
    findUnique: async ({ where }: any) => mem.subs.find((r) => Object.entries(where).every(([k, v]) => r[k] === v)) ?? null,
    findUniqueOrThrow: async ({ where }: any) => { const r = mem.subs.find((x) => x.id === where.id); if (!r) throw new Error("not found"); return r; },
    findFirst: async ({ where, orderBy }: any = {}) => { const rows = mem.subs.filter((r) => match(r, where)); return (orderBy ? rows.sort((a, b) => b.createdAt - a.createdAt) : rows)[0] ?? null; },
    findMany: async ({ where }: any = {}) => mem.subs.filter((r) => match(r, where)),
    create: async ({ data }: any) => {
      const r = { id: `s${++mem.seq}`, createdAt: mem.seq, creditMinor: 0, couponMinor: 0, couponId: null, firstChargeMinor: 0, failedCount: 0, dunningSent: 0, chargePaymentId: null, chargeRaisedAt: null, pendingPlanId: null, pendingInterval: null,
        currentPeriodStart: null, currentPeriodEnd: null, nextChargeAt: null, firstFailedAt: null, graceUntil: null, lastChargeRetryAt: null, endedReason: null, upgradeOfId: null, paymentMethodLabel: null,
        gateway: "CASHFREE", currency: "INR", rzpSubscriptionId: null, rzpPlanId: null, billingMode: "RECURRING", linksReason: null, renewalLinkId: null, renewalLinkUrl: null, renewalForPeriodStart: null, linkRemindersSent: 0, cardUpdate: false, ...data };
      mem.subs.push(r); return r;
    },
    update: async ({ where, data }: any) => { const r = mem.subs.find((x) => x.id === where.id)!; for (const [k, v] of Object.entries(data)) r[k] = v && typeof v === "object" && "increment" in (v as any) ? r[k] + (v as any).increment : v; return r; },
    updateMany: async ({ where, data }: any) => { const rows = mem.subs.filter((r) => match(r, where)); rows.forEach((r) => Object.assign(r, data)); return { count: rows.length }; },
  },
  subscriptionInvoice: {
    findUnique: async ({ where }: any) => mem.invoices.find((i) => i.paymentKey === where.paymentKey) ?? null,
    findFirst: async ({ where }: any) => mem.invoices.filter((i) => i.subscriptionId === where.subscriptionId).sort((a, b) => b.issuedAt - a.issuedAt)[0] ?? null,
    create: async ({ data }: any) => { const r = { id: `i${mem.invoices.length + 1}`, ...data }; mem.invoices.push(r); return r; },
  },
  invoiceCounter: { upsert: async ({ where }: any) => { mem.counters[where.fy] = (mem.counters[where.fy] ?? 0) + 1; return { fy: where.fy, last: mem.counters[where.fy] }; } },
  business: {
    findUnique: async ({ where }: any) => mem.business[where.id] ?? null,
    update: async ({ where, data }: any) => Object.assign(mem.business[where.id], data),
  },
  appSetting: {
    findUnique: async ({ where }: any) => (mem.settings[where.key] ? { key: where.key, value: mem.settings[where.key] } : null),
    upsert: async ({ where, create }: any) => { mem.settings[where.key] = create.value; },
  },
  coupon: { findUnique: async ({ where }: any) => (where.id === "c1" ? { code: "WELCOME" } : null) },
  webhookEvent: {
    create: async ({ data }: any) => { if (mem.events.some((e) => e.eventId === data.eventId)) throw new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x" }); mem.events.push(data); },
    deleteMany: async ({ where }: any) => { mem.events = mem.events.filter((e) => e.eventId !== where.eventId); },
  },
  $executeRaw: async () => 0,
});
// A failed transaction rolls back, like the real database: the rows as they were before it are put back.
fake.$transaction = async (fn: any) => {
  const before = mem.subs.map((r) => ({ ...r })); const invoices = [...mem.invoices];
  try { return await fn(fake); } catch (e) { mem.subs.length = 0; mem.subs.push(...before); mem.invoices.length = 0; mem.invoices.push(...invoices); throw e; }
};
vi.mock("@/lib/prisma", () => ({ prisma: fake }));
vi.mock("@/lib/notifications/enqueue", () => ({ notify: async (...items: any[]) => { mem.notices.push(...items.filter(Boolean)); } }));
vi.mock("@/lib/notifications/business", () => ({ alertRecipient: async () => "owner@x.com" }));
vi.mock("@/lib/flags", () => ({ isFeatureEnabled: (k: string) => (k === "intlSubscriptions" ? mem.flag : true) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: (m: string, c?: any) => mem.logs.push({ level: "warn", m, c }), error: (m: string, c?: any) => mem.logs.push({ level: "error", m, c }) } }));
vi.mock("@/lib/coupons/service", () => {
  class CouponUnavailableError extends Error {}
  return {
    CALVY_OWNER: "CALVY", CouponUnavailableError,
    previewCoupon: async (_db: unknown, i: { code: string; ctx: { amountMinor: number } }) => mem.previews[i.code.trim().toUpperCase()]?.(i.ctx.amountMinor) ?? { coupon: null, verdict: { ok: false, message: "This code is not valid." } },
    redeemForSubscription: async (_tx: unknown, p: { amountMinor: number }) => { if (mem.previews.__taken) throw new CouponUnavailableError("This code is no longer available."); return Math.floor((p.amountMinor * 20) / 100); },
  };
});

import { applyIntlPayment, handleRazorpayEvent, onIntlAuthenticated, onIntlEnded, onIntlHalted, onIntlLinkPaid, processRazorpayDue, startCardUpdate, startIntlCheckout } from "@/lib/subscriptions/razorpayService";
import { RazorpayApiError, type RazorpayClient } from "@/lib/subscriptions/razorpay";
import { POST as webhook } from "@/app/api/billing/razorpay/webhook/route";
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";

const T0 = new Date("2026-11-17T06:00:00Z");
const DAY = 86_400_000;
const unix = (d: Date) => Math.floor(d.getTime() / 1000);

function fakeClient(over: Partial<RazorpayClient> = {}) {
  const calls: { fn: string; args: any }[] = [];
  const rec = <T,>(fn: string, ret: T) => async (args: any) => { calls.push({ fn, args }); return ret; };
  const client: RazorpayClient = {
    createPlan: rec("createPlan", { id: "plan_1" }) as any,
    createSubscription: (async (args: any) => { calls.push({ fn: "createSubscription", args }); return { id: `sub_new${calls.filter((c) => c.fn === "createSubscription").length}`, status: "created", planId: "plan_1", startAt: null, currentEnd: null, paidCount: 0, shortUrl: null, notes: {} }; }) as any,
    fetchSubscription: rec("fetchSubscription", { id: "sub_rzp1", status: "active", planId: "plan_1", startAt: null, currentEnd: null, paidCount: 1, shortUrl: null, notes: {} }) as any,
    cancelSubscription: (async (id: string, atCycleEnd: boolean) => { calls.push({ fn: "cancelSubscription", args: { id, atCycleEnd } }); }) as any,
    updateSubscriptionPlan: (async (id: string, planId: string) => { calls.push({ fn: "updateSubscriptionPlan", args: { id, planId } }); }) as any,
    createPaymentLink: rec("createPaymentLink", { id: "plink_1", shortUrl: "https://rzp.io/l/one", status: "created" }) as any,
    ...over,
  };
  return { client, calls, deps: { client, keyId: "rzp_test_key" } };
}

/** A Razorpay-billed subscription, as it is stored once Calvy has created it at Razorpay. */
const sub = (over: any = {}) => fake.subscription.create({ data: {
  businessId: "b1", planId: "professional", interval: "MONTHLY", state: "PENDING", gateway: "RAZORPAY", currency: "USD", method: "card", cashfreeSubscriptionId: `rzp:${mem.seq + 1}`,
  rzpSubscriptionId: `sub_rzp${mem.seq + 1}`, rzpPlanId: "plan_1", amountMinor: 600, firstChargeMinor: 600, ...over,
} });
const pay = (id: string, amountMinor: number, over: any = {}) => ({ id, amountMinor, currency: "USD", status: "captured", method: "card", ...over });
const business = (over: any = {}) => ({ id: "b1", name: "Glow", currency: "USD", email: "o@x.com", plan: "free", planStatus: "free", planOverridePlan: null, planOverrideUntil: null, owner: { name: "Asha", email: "o@x.com" }, ...over });

beforeEach(() => {
  mem.subs = []; mem.invoices = []; mem.counters = {}; mem.notices = []; mem.settings = {}; mem.events = []; mem.logs = []; mem.seq = 0; mem.flag = true; mem.previews = {};
  mem.business = { b1: business() };
  delete process.env.CALVY_GSTIN; delete process.env.CALVY_LUT_NUMBER;
  process.env.RAZORPAY_KEY_ID = "rzp_test_key"; process.env.RAZORPAY_KEY_SECRET = "keysecret"; process.env.RAZORPAY_WEBHOOK_SECRET = "whsec";
});

describe("the first payment", () => {
  it("activates the plan, issues a USD receipt, and sets the business plan", async () => {
    const s = await sub();
    expect(await applyIntlPayment({ rzpSubscriptionId: s.rzpSubscriptionId }, pay("pay_1", 600), T0, null)).toBe("activated");
    expect(s.state).toBe("ACTIVE");
    expect(s.currentPeriodEnd.toISOString()).toBe("2026-12-17T06:00:00.000Z");
    expect(mem.business.b1).toMatchObject({ plan: "professional", planStatus: "active" });
    expect(mem.invoices).toHaveLength(1);
    expect(mem.invoices[0]).toMatchObject({ number: "CALVY/2026-27/0001", kind: "RECEIPT", currency: "USD", taxKind: "IGST", amountMinor: 600, paymentKey: "pay_1" });
    expect(mem.notices.map((n) => n.event)).toEqual(["subscription.started"]);
    expect(mem.notices[0].payload.amountLabel).toBe("$6");
  });
  it("is idempotent: the same payment reported twice (webhook then checkout confirmation) makes one invoice and one email", async () => {
    const s = await sub();
    await applyIntlPayment({ rzpSubscriptionId: s.rzpSubscriptionId }, pay("pay_1", 600), T0, null);
    expect(await applyIntlPayment({ rzpSubscriptionId: s.rzpSubscriptionId }, pay("pay_1", 600), new Date(T0.getTime() + 5000), null)).toBe("noop");
    expect(mem.invoices).toHaveLength(1);
    expect(mem.notices).toHaveLength(1);
    expect(s.currentPeriodEnd.toISOString()).toBe("2026-12-17T06:00:00.000Z");
  });
  it("a payment that is not captured is ignored", async () => {
    const s = await sub();
    expect(await applyIntlPayment({ rzpSubscriptionId: s.rzpSubscriptionId }, pay("pay_1", 600, { status: "authorized" }), T0, null)).toBe("noop");
    expect(s.state).toBe("PENDING");
  });
  it("a wrong amount is not applied (kept for review)", async () => {
    const s = await sub();
    expect(await applyIntlPayment({ rzpSubscriptionId: s.rzpSubscriptionId }, pay("pay_1", 100), T0, null)).toBe("amount_mismatch");
    expect(s.state).toBe("PENDING");
    expect(mem.invoices).toHaveLength(0);
  });
  it("REGION GUARD: a rupee payment is refused, and a Cashfree row is never touched by a Razorpay event", async () => {
    const s = await sub();
    expect(await applyIntlPayment({ rzpSubscriptionId: s.rzpSubscriptionId }, pay("pay_1", 600, { currency: "INR" }), T0, null)).toBe("currency_mismatch");
    const india = await fake.subscription.create({ data: { businessId: "b1", planId: "professional", interval: "MONTHLY", state: "PENDING", cashfreeSubscriptionId: "calvy_sub_x", rzpSubscriptionId: "sub_india", amountMinor: 34900, firstChargeMinor: 34900 } });
    expect(await applyIntlPayment({ rzpSubscriptionId: "sub_india" }, pay("pay_2", 34900), T0, null)).toBe("noop");
    expect(india.state).toBe("PENDING");
    expect(mem.invoices).toHaveLength(0);
    expect(await handleRazorpayEvent({ event: "subscription.charged", kind: "CHARGED", subscriptionId: "sub_unknown", payment: pay("pay_3", 600), link: null }, T0)).toBe("noop");
  });
  it("an unknown subscription is ignored", async () => expect(await applyIntlPayment({ rzpSubscriptionId: "sub_nope" }, pay("pay_1", 600), T0, null)).toBe("noop"));
});

describe("a coupon: the first period only, one checkout", () => {
  it("the first invoice carries the coupon as its own line and the recurring price is the full price", async () => {
    // 20% off 600 = 120 -> the first payment is 480; recurring stays 600
    const s = await sub({ firstChargeMinor: 480, creditMinor: 120, couponMinor: 120, couponId: "c1" });
    expect(await applyIntlPayment({ rzpSubscriptionId: s.rzpSubscriptionId }, pay("pay_1", 480), T0, null)).toBe("activated");
    expect(mem.invoices[0]).toMatchObject({ grossMinor: 600, creditMinor: 0, couponMinor: 120, couponCode: "WELCOME", amountMinor: 480, currency: "USD" });
    expect(s.amountMinor).toBe(600);
    // the first period still lasts a full month, and the next charge (at start_at) is the full price
    expect(s.currentPeriodEnd.toISOString()).toBe("2026-12-17T06:00:00.000Z");
    expect(await applyIntlPayment({ rzpSubscriptionId: s.rzpSubscriptionId }, pay("pay_2", 600), new Date("2026-12-17T06:01:00Z"), null)).toBe("renewed");
    expect(mem.invoices[1]).toMatchObject({ amountMinor: 600, couponMinor: 0 });
  });
});

describe("renewals", () => {
  async function active() {
    const s = await sub();
    await applyIntlPayment({ rzpSubscriptionId: s.rzpSubscriptionId }, pay("pay_1", 600), T0, null);
    return s;
  }
  it("a renewal extends the period by one and is idempotent", async () => {
    const s = await active();
    const t = new Date(T0.getTime() + 30 * DAY);
    expect(await applyIntlPayment({ rzpSubscriptionId: s.rzpSubscriptionId }, pay("pay_2", 600), t, null)).toBe("renewed");
    expect(await applyIntlPayment({ rzpSubscriptionId: s.rzpSubscriptionId }, pay("pay_2", 600), t, null)).toBe("noop");
    expect(mem.invoices).toHaveLength(2);
    expect(s.currentPeriodStart.toISOString()).toBe("2026-12-17T06:00:00.000Z");
    expect(s.currentPeriodEnd.toISOString()).toBe("2027-01-17T06:00:00.000Z");
    expect(mem.notices).toHaveLength(1); // like India, only the start sends an email; receipts are in Billing
  });
  it("a wrong renewal amount is not applied", async () => {
    const s = await active();
    expect(await applyIntlPayment({ rzpSubscriptionId: s.rzpSubscriptionId }, pay("pay_2", 999), new Date(T0.getTime() + 30 * DAY), null)).toBe("amount_mismatch");
    expect(mem.invoices).toHaveLength(1);
  });
  it("a scheduled downgrade takes effect with the first payment at the new price", async () => {
    const s = await sub({ planId: "business", amountMinor: 1500, firstChargeMinor: 1500 });
    await applyIntlPayment({ rzpSubscriptionId: s.rzpSubscriptionId }, pay("pay_1", 1500), T0, null);
    s.pendingPlanId = "professional"; s.pendingInterval = "MONTHLY";
    expect(await applyIntlPayment({ rzpSubscriptionId: s.rzpSubscriptionId }, pay("pay_2", 600), new Date(T0.getTime() + 30 * DAY), null)).toBe("renewed");
    expect(s).toMatchObject({ planId: "professional", amountMinor: 600, pendingPlanId: null });
    expect(mem.business.b1.plan).toBe("professional");
  });
  it("a payment after a halt returns the plan to active and clears the grace", async () => {
    const s = await active();
    await onIntlHalted(s.rzpSubscriptionId, new Date(T0.getTime() + 31 * DAY));
    expect(s.state).toBe("PAST_DUE");
    expect(await applyIntlPayment({ rzpSubscriptionId: s.rzpSubscriptionId }, pay("pay_3", 600), new Date(T0.getTime() + 33 * DAY), null)).toBe("renewed");
    expect(s).toMatchObject({ state: "ACTIVE", failedCount: 0, firstFailedAt: null, graceUntil: null, dunningSent: 0 });
  });
});

describe("upgrade", () => {
  it("the first payment of an upgrade ends the old subscription at Razorpay and emails 'upgraded'", async () => {
    const old = await sub({ state: "ACTIVE", planId: "professional", currentPeriodStart: T0, currentPeriodEnd: new Date(T0.getTime() + 30 * DAY) });
    const up = await sub({ planId: "business", amountMinor: 1500, firstChargeMinor: 1200, creditMinor: 300, upgradeOfId: old.id });
    const f = fakeClient();
    expect(await applyIntlPayment({ rzpSubscriptionId: up.rzpSubscriptionId }, pay("pay_up", 1200), new Date(T0.getTime() + 10 * DAY), f.deps)).toBe("activated");
    expect(old.state).toBe("ENDED");
    expect(old.endedReason).toBe("upgraded");
    expect(f.calls).toContainEqual({ fn: "cancelSubscription", args: { id: old.rzpSubscriptionId, atCycleEnd: false } });
    expect(mem.invoices[0]).toMatchObject({ grossMinor: 1500, creditMinor: 300, amountMinor: 1200 });
    expect(mem.notices.map((n) => n.event)).toEqual(["subscription.upgraded"]);
  });
});

describe("failed renewals: halted = past due, 7-day grace, reminders on days 1, 3, 6, then the Free plan's features", () => {
  async function halted() {
    const s = await sub();
    await applyIntlPayment({ rzpSubscriptionId: s.rzpSubscriptionId }, pay("pay_1", 600), T0, null);
    const h = new Date(T0.getTime() + 31 * DAY);
    expect(await onIntlHalted(s.rzpSubscriptionId, h)).toBe("past_due");
    mem.notices = [];
    return { s, h };
  }
  it("the halt starts a 7-day grace and keeps paid features meanwhile", async () => {
    const { s, h } = await halted();
    expect(s).toMatchObject({ state: "PAST_DUE", failedCount: 1 });
    expect(s.graceUntil.getTime() - h.getTime()).toBe(7 * DAY);
    expect(mem.business.b1.plan).toBe("professional");
  });
  it("a repeated halted event does not restart the grace", async () => {
    const { s, h } = await halted();
    const grace = s.graceUntil.getTime();
    expect(await onIntlHalted(s.rzpSubscriptionId, new Date(h.getTime() + 2 * DAY))).toBe("noop");
    expect(s.graceUntil.getTime()).toBe(grace);
  });
  it("the cron sends the reminders on days 1, 3 and 6, once each", async () => {
    const { s, h } = await halted();
    const run = (d: number) => processRazorpayDue(new Date(h.getTime() + d * DAY), null);
    expect((await run(0.5)).dunning).toBe(0);
    expect((await run(1)).dunning).toBe(1);
    expect((await run(1.5)).dunning).toBe(0);
    expect((await run(3)).dunning).toBe(1);
    expect((await run(6)).dunning).toBe(1);
    expect((await run(6.5)).dunning).toBe(0);
    expect(mem.notices.map((n) => n.event)).toEqual(["subscription.payment_failed_1", "subscription.payment_failed_2", "subscription.payment_failed_3"]);
    expect(mem.notices[0].payload.amountLabel).toBe("$6");
    expect(s.dunningSent).toBe(3);
  });
  it("after the grace the business is on the Free plan's features, data untouched, and told so", async () => {
    const { s, h } = await halted();
    const f = fakeClient();
    const r = await processRazorpayDue(new Date(h.getTime() + 7 * DAY + 1000), f.deps);
    expect(r.ended).toBe(1);
    expect(s).toMatchObject({ state: "ENDED", endedReason: "payment_failed" });
    expect(mem.business.b1).toMatchObject({ plan: "free", planStatus: "free" });
    expect(f.calls).toContainEqual({ fn: "cancelSubscription", args: { id: s.rzpSubscriptionId, atCycleEnd: false } });
    expect(mem.notices.map((n) => n.event)).toContain("subscription.downgraded");
    expect(Object.keys(fake)).not.toContain("appointment"); // nothing here ever deletes business data
  });
  it("an admin plan override still wins over the downgrade", async () => {
    const { s, h } = await halted();
    mem.business.b1.planOverridePlan = "business"; mem.business.b1.planOverrideUntil = new Date(h.getTime() + 60 * DAY);
    await processRazorpayDue(new Date(h.getTime() + 8 * DAY), null);
    expect(s.state).toBe("ENDED");
    expect(mem.business.b1.plan).toBe("professional"); // not touched while the override is in force
  });
});

describe("cancelled", () => {
  it("keeps access to the end of the paid period, charges nothing more, and emails once", async () => {
    const s = await sub();
    await applyIntlPayment({ rzpSubscriptionId: s.rzpSubscriptionId }, pay("pay_1", 600), T0, null);
    mem.notices = [];
    expect(await onIntlEnded(s.rzpSubscriptionId, new Date(T0.getTime() + 5 * DAY))).toBe("ended");
    expect(await onIntlEnded(s.rzpSubscriptionId, new Date(T0.getTime() + 5 * DAY))).toBe("noop");
    expect(s.state).toBe("ENDED");
    expect(mem.business.b1.plan).toBe("professional"); // paid until the period end
    expect(mem.notices.map((n) => n.event)).toEqual(["subscription.cancelled"]);
  });
  it("a subscription cancelled before it was ever paid just ends", async () => {
    const s = await sub();
    expect(await onIntlEnded(s.rzpSubscriptionId)).toBe("ended");
    expect(s.state).toBe("ENDED");
    expect(mem.business.b1.plan).toBe("free");
  });
  it("events route to the right handler", async () => {
    const s = await sub({ state: "ACTIVE", currentPeriodStart: T0, currentPeriodEnd: new Date(T0.getTime() + 30 * DAY) });
    const ev = (kind: any) => ({ event: `subscription.${kind.toLowerCase()}`, kind, subscriptionId: s.rzpSubscriptionId, payment: null, link: null });
    expect(await handleRazorpayEvent(ev("HALTED"), T0)).toBe("past_due");
    expect(await handleRazorpayEvent(ev("CANCELLED"), T0)).toBe("ended");
    expect(await handleRazorpayEvent(ev("OTHER"), T0)).toBe("ignored");
    expect(await handleRazorpayEvent({ ...ev("HALTED"), subscriptionId: null }, T0)).toBe("no_subscription");
  });
});

describe("startIntlCheckout", () => {
  const start = (over: any = {}, deps = fakeClient().deps) => startIntlCheckout({ businessId: "b1", planId: "professional", interval: "MONTHLY", now: T0, deps, ...over });
  it("no discount: the subscription starts at once at the plan price (no start_at, no add-on)", async () => {
    const f = fakeClient();
    const r = await start({}, f.deps);
    expect(r).toMatchObject({ ok: true, mode: "RECURRING", razorpaySubscriptionId: "sub_new1", keyId: "rzp_test_key", quote: { dueMinor: 600 } });
    const call = f.calls.find((c) => c.fn === "createSubscription")!.args;
    expect(call).toMatchObject({ planId: "plan_1", totalCount: 120 });
    expect(call.startAt).toBeUndefined();
    expect(call.addons).toBeUndefined();
    expect(mem.subs[0]).toMatchObject({ gateway: "RAZORPAY", currency: "USD", state: "PENDING", billingMode: "RECURRING", firstChargeMinor: 600, amountMinor: 600 });
  });
  it("yearly plans are billed yearly with 10 cycles", async () => {
    const f = fakeClient();
    await start({ interval: "YEARLY" }, f.deps);
    expect(f.calls.find((c) => c.fn === "createPlan")!.args).toMatchObject({ period: "yearly", amountMinor: 6000 });
    expect(f.calls.find((c) => c.fn === "createSubscription")!.args.totalCount).toBe(10);
  });
  it("the Razorpay plan is made once and reused", async () => {
    const f = fakeClient();
    await start({}, f.deps);
    mem.subs = [];
    await start({}, f.deps);
    expect(f.calls.filter((c) => c.fn === "createPlan")).toHaveLength(1);
  });
  it("COUPON: one checkout, the first period is the discounted add-on and recurring starts a period later at full price", async () => {
    mem.previews.WELCOME = (amount: number) => ({ coupon: { id: "c1", code: "WELCOME", name: "Welcome", kind: "PERCENT" }, verdict: { ok: true, discountMinor: Math.floor((amount * 20) / 100) } });
    const f = fakeClient();
    const r = await start({ couponCode: "welcome" }, f.deps);
    expect(r).toMatchObject({ ok: true, mode: "RECURRING", quote: { grossMinor: 600, couponMinor: 120, dueMinor: 480 } });
    const call = f.calls.find((c) => c.fn === "createSubscription")!.args;
    expect(call.addons).toEqual([{ item: { name: "Calvy Pro, first month", amount: 480, currency: "USD" } }]);
    expect(call.startAt).toBe(unix(new Date("2026-12-17T06:00:00Z")));
    expect(mem.subs[0]).toMatchObject({ firstChargeMinor: 480, amountMinor: 600, couponId: "c1", couponMinor: 120, creditMinor: 120 });
  });
  it("a flat (rupee-made) coupon never applies to a dollar plan", async () => {
    mem.previews.FLAT = () => ({ coupon: { id: "c2", code: "FLAT", name: "Flat", kind: "FLAT" }, verdict: { ok: true, discountMinor: 5000 } });
    const r = await start({ couponCode: "FLAT" });
    expect(r).toMatchObject({ ok: false, status: 400, error: "This code is only for India plans." });
    expect(mem.subs).toHaveLength(0);
  });
  it("an unknown code is refused out loud and creates nothing at Razorpay", async () => {
    const f = fakeClient();
    expect(await start({ couponCode: "NOPE" }, f.deps)).toMatchObject({ ok: false, status: 400 });
    expect(f.calls.find((c) => c.fn === "createSubscription")).toBeUndefined();
  });
  it("a coupon used up meanwhile cancels the pending Razorpay subscription and says so", async () => {
    mem.previews.WELCOME = (amount: number) => ({ coupon: { id: "c1", code: "WELCOME", name: "Welcome", kind: "PERCENT" }, verdict: { ok: true, discountMinor: Math.floor((amount * 20) / 100) } });
    mem.previews.__taken = true;
    const f = fakeClient();
    expect(await start({ couponCode: "WELCOME" }, f.deps)).toMatchObject({ ok: false, status: 409 });
    expect(f.calls).toContainEqual({ fn: "cancelSubscription", args: { id: "sub_new1", atCycleEnd: false } });
    expect(mem.subs).toHaveLength(0);
  });
  it("REGION GUARD: refused for an Indian business, for rupees, and when the switch is off", async () => {
    mem.business.b1 = business({ currency: "INR" });
    expect(await start()).toMatchObject({ ok: false, status: 403 });
    mem.business.b1 = business({ country: "IN", currency: "USD" });
    expect(await start()).toMatchObject({ ok: false, status: 403 });
    mem.business.b1 = business({ country: "US", currency: "INR" });
    expect(await start()).toMatchObject({ ok: false, status: 403 });
    mem.business.b1 = business();
    mem.flag = false;
    expect(await start()).toMatchObject({ ok: false, status: 503 });
    expect(mem.subs).toHaveLength(0);
  });
  it("without Razorpay keys it is unavailable, never half-working", async () => {
    expect(await startIntlCheckout({ businessId: "b1", planId: "professional", interval: "MONTHLY", now: T0, deps: null })).toMatchObject({ ok: false, status: 503 });
  });
  it("a plain Razorpay failure (not about currency or recurring) is an error, not a silent change of how they are billed", async () => {
    const f = fakeClient({ createSubscription: async () => { throw new RazorpayApiError(500, null, "boom"); } });
    expect(await start({}, f.deps)).toMatchObject({ ok: false, status: 502 });
    expect(f.calls.find((c) => c.fn === "createPaymentLink")).toBeUndefined();
    expect(mem.subs).toHaveLength(0);
  });
  it("already on the plan, or a downgrade, is refused", async () => {
    await sub({ state: "ACTIVE", planId: "professional", currentPeriodStart: T0, currentPeriodEnd: new Date(T0.getTime() + 30 * DAY) });
    expect(await start()).toMatchObject({ ok: false, status: 409 });
  });
});

describe("the fallback to payment links is never silent", () => {
  const refuse = () => fakeClient({ createSubscription: async () => { throw new RazorpayApiError(400, "BAD_REQUEST_ERROR", "International currency is not enabled for recurring payments"); } });
  it("falls back to a payment link, and logs it, flags it for Admin -> Billing, and emails the team", async () => {
    const f = refuse();
    const r = await startIntlCheckout({ businessId: "b1", planId: "professional", interval: "MONTHLY", now: T0, deps: f.deps });
    expect(r).toMatchObject({ ok: true, mode: "LINKS", url: "https://rzp.io/l/one" });
    expect(mem.subs[0]).toMatchObject({ billingMode: "LINKS", gateway: "RAZORPAY", renewalLinkId: "plink_1", linksReason: expect.stringContaining("International currency") });
    // logged
    expect(mem.logs.some((l) => l.level === "warn" && /links mode/i.test(l.m))).toBe(true);
    // the team is emailed
    expect(mem.notices).toHaveLength(1);
    expect(mem.notices[0]).toMatchObject({ event: "billing.links_mode", audience: "PLATFORM", recipient: "team@calvy.io", template: "billing_links_mode" });
    expect(mem.notices[0].payload).toMatchObject({ businessName: "Glow", businessId: "b1" });
    // the link carries the notes that tie it to the subscription
    expect(f.calls.find((c) => c.fn === "createPaymentLink")!.args.notes).toMatchObject({ calvySubscription: mem.subs[0].cashfreeSubscriptionId });
  });
  it("the team address can be set by env", async () => {
    process.env.CALVY_TEAM_EMAIL = "billing@calvy.io";
    await startIntlCheckout({ businessId: "b1", planId: "professional", interval: "MONTHLY", now: T0, deps: refuse().deps });
    expect(mem.notices[0].recipient).toBe("billing@calvy.io");
    delete process.env.CALVY_TEAM_EMAIL;
  });
  it("paying the link activates the plan, once, and only for the link on record", async () => {
    await startIntlCheckout({ businessId: "b1", planId: "professional", interval: "MONTHLY", now: T0, deps: refuse().deps });
    const s = mem.subs[0];
    const link = { id: "plink_1", notes: { calvySubscription: s.cashfreeSubscriptionId } };
    expect(await onIntlLinkPaid({ id: "plink_other", notes: link.notes }, pay("pay_1", 600), T0)).toBe("noop");
    expect(await onIntlLinkPaid(link, pay("pay_1", 600), T0)).toBe("activated");
    expect(await onIntlLinkPaid(link, pay("pay_1", 600), T0)).toBe("noop");
    expect(s).toMatchObject({ state: "ACTIVE", renewalLinkId: null });
    expect(mem.invoices).toHaveLength(1);
  });
  it("links mode: a link goes out 7 days before the period ends, with reminders at 3 and 1 days", async () => {
    const s = await sub({ billingMode: "LINKS", rzpSubscriptionId: null, state: "ACTIVE", currentPeriodStart: T0, currentPeriodEnd: new Date(T0.getTime() + 30 * DAY) });
    const f = fakeClient();
    const end = s.currentPeriodEnd.getTime();
    expect((await processRazorpayDue(new Date(end - 8 * DAY), f.deps)).links).toBe(0);
    expect((await processRazorpayDue(new Date(end - 7 * DAY), f.deps)).links).toBe(1);
    expect((await processRazorpayDue(new Date(end - 6 * DAY), f.deps)).links).toBe(0);
    expect((await processRazorpayDue(new Date(end - 3 * DAY), f.deps)).reminders).toBe(1);
    expect((await processRazorpayDue(new Date(end - 3 * DAY + 1000), f.deps)).reminders).toBe(0);
    expect((await processRazorpayDue(new Date(end - 1 * DAY), f.deps)).reminders).toBe(1);
    expect(mem.notices.map((n) => n.event)).toEqual(["subscription.renewal_link", "subscription.renewal_link", "subscription.renewal_link"]);
    expect(mem.notices[0].payload.linkUrl).toBe("https://rzp.io/l/one");
    expect(f.calls.filter((c) => c.fn === "createPaymentLink")).toHaveLength(1);
  });
  it("links mode: an unpaid period becomes past due with the same grace and reminders", async () => {
    const s = await sub({ billingMode: "LINKS", rzpSubscriptionId: null, state: "ACTIVE", currentPeriodStart: T0, currentPeriodEnd: new Date(T0.getTime() + 30 * DAY) });
    await processRazorpayDue(new Date(s.currentPeriodEnd.getTime() + 1000), null);
    expect(s.state).toBe("PAST_DUE");
    expect(s.graceUntil.getTime() - s.firstFailedAt.getTime()).toBe(7 * DAY);
  });
});

describe("scheduled cancel and downgrade (sent to Razorpay only in the last 2 days, so Undo works until then)", () => {
  it("a cancel is sent at cycle end", async () => {
    const s = await sub({ state: "ACTIVE", currentPeriodStart: T0, currentPeriodEnd: new Date(T0.getTime() + 30 * DAY), pendingPlanId: "free" });
    const f = fakeClient();
    expect((await processRazorpayDue(new Date(s.currentPeriodEnd.getTime() - 5 * DAY), f.deps)).cancelsSent).toBe(0);
    expect((await processRazorpayDue(new Date(s.currentPeriodEnd.getTime() - 1 * DAY), f.deps)).cancelsSent).toBe(1);
    expect(f.calls).toContainEqual({ fn: "cancelSubscription", args: { id: s.rzpSubscriptionId, atCycleEnd: true } });
    expect(s.chargeRaisedAt).toBeTruthy();
    expect((await processRazorpayDue(new Date(s.currentPeriodEnd.getTime() - 0.5 * DAY), f.deps)).cancelsSent).toBe(0); // only once
  });
  it("a downgrade is scheduled at cycle end on the cheaper plan", async () => {
    const s = await sub({ state: "ACTIVE", planId: "business", amountMinor: 1500, currentPeriodStart: T0, currentPeriodEnd: new Date(T0.getTime() + 30 * DAY), pendingPlanId: "professional", pendingInterval: "MONTHLY" });
    const f = fakeClient();
    await processRazorpayDue(new Date(s.currentPeriodEnd.getTime() - 1 * DAY), f.deps);
    expect(f.calls.find((c) => c.fn === "updateSubscriptionPlan")!.args).toEqual({ id: s.rzpSubscriptionId, planId: "plan_1" });
  });
  it("a cancel Razorpay never confirmed is closed a day after the period ends", async () => {
    const s = await sub({ state: "ACTIVE", currentPeriodStart: T0, currentPeriodEnd: new Date(T0.getTime() + 30 * DAY), pendingPlanId: "free" });
    await processRazorpayDue(new Date(s.currentPeriodEnd.getTime() + 2 * DAY), null);
    expect(s.state).toBe("ENDED");
    expect(mem.business.b1.plan).toBe("free");
  });
  it("an abandoned replacement card (no payment within a day) is closed", async () => {
    const s = await sub({ cardUpdate: true });
    s.createdAt = 0; // old
    await processRazorpayDue(new Date(T0.getTime() + 2 * DAY), null);
    // createdAt is a sequence number in this fake: the rule compares dates, so emulate with a Date
    s.createdAt = new Date(T0.getTime() - 2 * DAY);
    await processRazorpayDue(new Date(T0.getTime()), null);
    expect(s.state).toBe("ENDED");
  });
});

describe("Update card: cancel and replace without a double charge", () => {
  async function activeOld(over: any = {}) {
    return sub({ state: "ACTIVE", currentPeriodStart: T0, currentPeriodEnd: new Date(T0.getTime() + 20 * DAY), nextChargeAt: new Date(T0.getTime() + 20 * DAY), paymentMethodLabel: "Card", ...over });
  }
  it("the new subscription starts at the CURRENT period end, with no add-on", async () => {
    const old = await activeOld();
    const f = fakeClient();
    const r = await startCardUpdate({ businessId: "b1", now: new Date(T0.getTime() + 5 * DAY), deps: f.deps });
    expect(r).toMatchObject({ ok: true, razorpaySubscriptionId: "sub_new1" });
    const call = f.calls.find((c) => c.fn === "createSubscription")!.args;
    expect(call.startAt).toBe(unix(old.currentPeriodEnd));
    expect(call.addons).toBeUndefined();
    expect(mem.subs.at(-1)).toMatchObject({ cardUpdate: true, state: "PENDING", upgradeOfId: old.id, amountMinor: 600 });
    expect(old.state).toBe("ACTIVE"); // the old one keeps its plan until the new card is authenticated
  });
  it("when the new card is authenticated the old subscription is cancelled and the paid period carries over (no new invoice, no double charge)", async () => {
    const old = await activeOld();
    await startCardUpdate({ businessId: "b1", now: new Date(T0.getTime() + 5 * DAY), deps: fakeClient().deps });
    const fresh = mem.subs.at(-1);
    const f = fakeClient();
    expect(await onIntlAuthenticated(fresh.rzpSubscriptionId, new Date(T0.getTime() + 5 * DAY), f)).toBe("activated");
    expect(fresh).toMatchObject({ state: "ACTIVE", currentPeriodEnd: old.currentPeriodEnd });
    expect(old).toMatchObject({ state: "ENDED", endedReason: "card_updated" });
    expect(f.calls).toContainEqual({ fn: "cancelSubscription", args: { id: old.rzpSubscriptionId, atCycleEnd: false } });
    expect(mem.invoices).toHaveLength(0);
    expect(mem.notices).toHaveLength(0);
    // the new subscription's first real charge, at the period end, is a normal renewal
    expect(await applyIntlPayment({ rzpSubscriptionId: fresh.rzpSubscriptionId }, pay("pay_r", 600), new Date(old.currentPeriodEnd.getTime() + 60_000), null)).toBe("renewed");
    expect(mem.invoices).toHaveLength(1);
  });
  it("a halted plan: the new card starts now and its first charge is the overdue renewal", async () => {
    const old = await activeOld({ state: "PAST_DUE", currentPeriodEnd: new Date(T0.getTime() - DAY), firstFailedAt: T0, graceUntil: new Date(T0.getTime() + 7 * DAY) });
    const f = fakeClient();
    await startCardUpdate({ businessId: "b1", now: T0, deps: f.deps });
    expect(f.calls.find((c) => c.fn === "createSubscription")!.args.startAt).toBeUndefined();
    const fresh = mem.subs.at(-1);
    expect(await applyIntlPayment({ rzpSubscriptionId: fresh.rzpSubscriptionId }, pay("pay_x", 600), T0, f.deps)).toBe("activated");
    expect(fresh.state).toBe("ACTIVE");
    expect(old).toMatchObject({ state: "ENDED", endedReason: "card_updated" });
    expect(mem.business.b1.plan).toBe("professional");
    expect(mem.notices).toHaveLength(0); // a card update is not announced as a new plan
  });
  it("is refused for links mode (no card), for India, and without a subscription", async () => {
    await activeOld({ billingMode: "LINKS" });
    expect(await startCardUpdate({ businessId: "b1", now: T0, deps: fakeClient().deps })).toMatchObject({ ok: false, status: 409 });
    mem.subs = [];
    expect(await startCardUpdate({ businessId: "b1", now: T0, deps: fakeClient().deps })).toMatchObject({ ok: false, status: 404 });
    mem.business.b1 = business({ currency: "INR" });
    expect(await startCardUpdate({ businessId: "b1", now: T0, deps: fakeClient().deps })).toMatchObject({ ok: false, status: 403 });
  });
});

describe("the webhook route", () => {
  const sign = (body: string, secret = "whsec") => createHmac("sha256", secret).update(body).digest("hex");
  const post = (body: string, headers: Record<string, string> = {}) => webhook(new NextRequest("http://localhost/api/billing/razorpay/webhook", { method: "POST", body, headers }));
  const charged = (paymentId: string, amount: number, subId: string) => JSON.stringify({ event: "subscription.charged", payload: { subscription: { entity: { id: subId } }, payment: { entity: { id: paymentId, amount, currency: "USD", status: "captured", method: "card" } } } });

  it("refuses an unsigned or wrongly signed request and applies nothing", async () => {
    const s = await sub();
    const body = charged("pay_1", 600, s.rzpSubscriptionId);
    expect((await post(body)).status).toBe(401);
    expect((await post(body, { "x-razorpay-signature": sign(body, "attacker") })).status).toBe(401);
    expect((await post(body + " ", { "x-razorpay-signature": sign(body) })).status).toBe(401);
    expect(s.state).toBe("PENDING");
    expect(mem.events).toHaveLength(0);
  });
  it("is unavailable (503) without a webhook secret, even for a request that would otherwise verify", async () => {
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    const body = charged("pay_1", 600, "sub_x");
    expect((await post(body, { "x-razorpay-signature": sign(body, "") })).status).toBe(503);
  });
  it("applies a verified event once, and a replay with the same event id changes nothing", async () => {
    const s = await sub();
    const body = charged("pay_1", 600, s.rzpSubscriptionId);
    const headers = { "x-razorpay-signature": sign(body), "x-razorpay-event-id": "evt_1" };
    const first = await post(body, headers);
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ received: true, result: "activated" });
    const again = await post(body, headers);
    expect(await again.json()).toMatchObject({ result: "duplicate" });
    expect(mem.invoices).toHaveLength(1);
  });
  it("the same payment under a NEW event id (Razorpay re-sends as a different event) still makes one invoice", async () => {
    const s = await sub();
    const body = charged("pay_1", 600, s.rzpSubscriptionId);
    await post(body, { "x-razorpay-signature": sign(body), "x-razorpay-event-id": "evt_1" });
    const r = await post(body, { "x-razorpay-signature": sign(body), "x-razorpay-event-id": "evt_2" });
    expect(await r.json()).toMatchObject({ result: "noop" });
    expect(mem.invoices).toHaveLength(1);
  });
  it("without an event-id header the body's hash is the identity of a repeat", async () => {
    const s = await sub();
    const body = charged("pay_1", 600, s.rzpSubscriptionId);
    const headers = { "x-razorpay-signature": sign(body) };
    await post(body, headers);
    expect(await (await post(body, headers)).json()).toMatchObject({ result: "duplicate" });
  });
  it("handles halted and cancelled and maps them to the existing status model", async () => {
    const s = await sub();
    await applyIntlPayment({ rzpSubscriptionId: s.rzpSubscriptionId }, pay("pay_1", 600), T0, null);
    const ev = (event: string) => JSON.stringify({ event, payload: { subscription: { entity: { id: s.rzpSubscriptionId } } } });
    const h = ev("subscription.halted");
    expect(await (await post(h, { "x-razorpay-signature": sign(h), "x-razorpay-event-id": "e_h" })).json()).toMatchObject({ result: "past_due" });
    expect(s.state).toBe("PAST_DUE");
    const c = ev("subscription.cancelled");
    expect(await (await post(c, { "x-razorpay-signature": sign(c), "x-razorpay-event-id": "e_c" })).json()).toMatchObject({ result: "ended" });
    expect(s.state).toBe("ENDED");
  });
  it("a verified event that fails to apply releases its id (500), so Razorpay's retry can succeed", async () => {
    const s = await sub();
    const body = charged("pay_1", 600, s.rzpSubscriptionId);
    const headers = { "x-razorpay-signature": sign(body), "x-razorpay-event-id": "evt_boom" };
    const original = fake.subscription.findFirst;
    fake.subscription.findFirst = async () => { throw new Error("db down"); };
    const failed = await post(body, headers);
    fake.subscription.findFirst = original;
    expect(failed.status).toBe(500);
    expect(mem.events).toHaveLength(0);
    expect((await post(body, headers)).status).toBe(200);
    expect(mem.subs[0].state).toBe("ACTIVE"); // (rollback restores copies of the rows)
  });
  it("an event for an unknown or Cashfree-billed subscription is acknowledged and ignored", async () => {
    const body = charged("pay_1", 600, "sub_unknown");
    const r = await post(body, { "x-razorpay-signature": sign(body), "x-razorpay-event-id": "evt_u" });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ result: "noop" });
  });
});

describe("wiring (source checks)", () => {
  const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
  it("the confirm route needs the owner, their own subscription and a valid signature", () => {
    const src = read("app/api/subscriptions/razorpay/confirm/route.ts");
    expect(src).toContain('accessSession("owner")');
    expect(src).toContain("businessId: session.user.businessId");
    expect(read("lib/subscriptions/razorpayService.ts")).toContain("verifyCheckoutSignature(i.paymentId");
  });
  it("the cron runs the Razorpay step", () => expect(read("app/api/cron/notifications/route.ts")).toContain("processRazorpayDue"));
  it("Admin -> Billing shows the links-mode badge", () => {
    expect(read("app/admin/billing/page.tsx")).toContain("links mode");
    expect(read("components/admin/AdminLayout.tsx")).toContain("/admin/billing");
  });
  it("the Billing page offers Update card (recurring) and never shows India-only payment methods to an international business", () => {
    const ui = read("app/dashboard/billing/BillingClient.tsx");
    expect(ui).toContain("Update card");
    expect(ui).toContain("{!intl && <fieldset");
  });
});
