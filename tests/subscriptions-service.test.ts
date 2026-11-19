import { describe, it, expect, vi, beforeEach } from "vitest";

// An in-memory stand-in for the few Prisma calls the subscription service makes, so the state machine, idempotency, invoicing and
// plan-override precedence are tested end to end (the database itself is not involved).
const mem = vi.hoisted(() => {
  const s = { subs: [] as any[], invoices: [] as any[], counters: {} as Record<string, number>, business: {} as Record<string, any>, notices: [] as any[], cancelled: [] as string[], charges: [] as any[], seq: 0 };
  return s;
});
const subWhere = (r: any, w: any = {}) => Object.entries(w).every(([k, v]: [string, any]) => {
  if (v && typeof v === "object" && "in" in v) return v.in.includes(r[k]);
  if (v && typeof v === "object" && "not" in v) return r[k] !== v.not;
  if (v && typeof v === "object" && "lte" in v) return r[k] != null && r[k] <= v.lte;
  if (k === "business") return true;
  return r[k] === v;
});
const fake = vi.hoisted(() => ({} as any));
Object.assign(fake, {
  subscription: {
    findUnique: async ({ where }: any) => mem.subs.find((r) => (where.id ? r.id === where.id : r.cashfreeSubscriptionId === where.cashfreeSubscriptionId)) ?? null,
    findUniqueOrThrow: async ({ where }: any) => { const r = mem.subs.find((x) => x.id === where.id); if (!r) throw new Error("nf"); return r; },
    findFirst: async ({ where, orderBy }: any = {}) => { const rows = mem.subs.filter((r) => subWhere(r, where)); return (orderBy ? rows.sort((a, b) => b.createdAt - a.createdAt) : rows)[0] ?? null; },
    findMany: async ({ where }: any = {}) => mem.subs.filter((r) => subWhere(r, where)),
    create: async ({ data }: any) => { const r = { id: `s${++mem.seq}`, createdAt: mem.seq, creditMinor: 0, couponMinor: 0, couponId: null, firstChargeMinor: 0, failedCount: 0, dunningSent: 0, chargePaymentId: null, pendingPlanId: null, pendingInterval: null, currentPeriodStart: null, currentPeriodEnd: null, nextChargeAt: null, firstFailedAt: null, graceUntil: null, lastChargeRetryAt: null, endedReason: null, upgradeOfId: null, paymentMethodLabel: null, ...data }; mem.subs.push(r); return r; },
    update: async ({ where, data }: any) => { const r = mem.subs.find((x) => x.id === where.id)!; for (const [k, v] of Object.entries(data)) r[k] = v && typeof v === "object" && "increment" in (v as any) ? r[k] + (v as any).increment : v; return r; },
    updateMany: async ({ where, data }: any) => { const rows = mem.subs.filter((r) => subWhere(r, where)); rows.forEach((r) => Object.assign(r, data)); return { count: rows.length }; },
  },
  subscriptionInvoice: {
    findUnique: async ({ where }: any) => mem.invoices.find((i) => i.paymentKey === where.paymentKey) ?? null,
    findFirst: async ({ where }: any) => mem.invoices.filter((i) => i.subscriptionId === where.subscriptionId).sort((a, b) => b.issuedAt - a.issuedAt)[0] ?? null,
    create: async ({ data }: any) => { const r = { id: `i${mem.invoices.length + 1}`, ...data }; mem.invoices.push(r); return r; },
  },
  invoiceCounter: { upsert: async ({ where, update }: any) => { mem.counters[where.fy] = (mem.counters[where.fy] ?? 0) + 1; void update; return { fy: where.fy, last: mem.counters[where.fy] }; } },
  business: {
    findUnique: async ({ where }: any) => mem.business[where.id] ?? null,
    update: async ({ where, data }: any) => Object.assign(mem.business[where.id], data),
  },
  coupon: { findUnique: async ({ where }: any) => (where.id === "c1" ? { code: "WELCOME50" } : null) },
  $executeRaw: async () => 0,
});
fake.$transaction = async (fn: any) => fn(fake);
vi.mock("@/lib/prisma", () => ({ prisma: fake }));
vi.mock("@/lib/notifications/enqueue", () => ({ notify: async (...items: any[]) => { mem.notices.push(...items.filter(Boolean)); } }));
vi.mock("@/lib/notifications/business", () => ({ alertRecipient: async () => "owner@x.com" }));
const client = { createSubscription: vi.fn(), getSubscription: vi.fn(), charge: vi.fn(async (i: any) => { mem.charges.push(i); return { paymentId: i.paymentId, status: "INITIALIZED" }; }), cancel: vi.fn(async (id: string) => { mem.cancelled.push(id); }) };
vi.mock("@/lib/subscriptions/cashfree", async (orig) => ({ ...(await orig<typeof import("@/lib/subscriptions/cashfree")>()), getSubsClient: () => client }));

import { applySubscriptionState, onAuthorised, onChargeFailed, onChargeSucceeded, onMandateEnded, processDueSubscriptions, scheduleChange, startCheckout } from "@/lib/subscriptions/service";

const T0 = new Date("2026-11-17T06:00:00Z");
const DAY = 86_400_000;
const sub = (over: any = {}) => fake.subscription.create({ data: { businessId: "b1", planId: "professional", interval: "MONTHLY", state: "PENDING", cashfreeSubscriptionId: `cf${mem.seq + 1}`, amountMinor: 34900, firstChargeMinor: 34900, method: "upi_card", ...over } });
const biz = () => mem.business.b1;

beforeEach(() => {
  mem.subs = []; mem.invoices = []; mem.counters = {}; mem.notices = []; mem.cancelled = []; mem.charges = []; mem.seq = 0;
  mem.business = { b1: { id: "b1", name: "Glow", plan: "free", planStatus: "free", currency: "INR", phone: "9999999999", email: "o@x.com", owner: { name: "Asha", email: "o@x.com" }, planOverridePlan: null, planOverrideUntil: null } };
  client.cancel.mockClear(); client.charge.mockClear();
  delete process.env.CALVY_GSTIN;
});

describe("a plan coupon is its own labelled line on the invoice", () => {
  it("splits the coupon from the proration credit and records the code", async () => {
    const s = await sub({ amountMinor: 34900, creditMinor: 7000 + 5000, couponMinor: 5000, couponId: "c1", firstChargeMinor: 22900 });
    await onAuthorised(s.cashfreeSubscriptionId, { method: "upi", now: T0 });
    expect(mem.invoices[0]).toMatchObject({ grossMinor: 34900, creditMinor: 7000, couponMinor: 5000, couponCode: "WELCOME50", amountMinor: 22900 });
  });
  it("with only a coupon the credit line is zero", async () => {
    const s = await sub({ amountMinor: 34900, creditMinor: 5000, couponMinor: 5000, couponId: "c1", firstChargeMinor: 29900 });
    await onAuthorised(s.cashfreeSubscriptionId, { method: "upi", now: T0 });
    expect(mem.invoices[0]).toMatchObject({ creditMinor: 0, couponMinor: 5000, couponCode: "WELCOME50", amountMinor: 29900 });
  });
  it("without a coupon nothing changes", async () => {
    const s = await sub();
    await onAuthorised(s.cashfreeSubscriptionId, { method: "upi", now: T0 });
    expect(mem.invoices[0]).toMatchObject({ couponMinor: 0, couponCode: null });
  });
});

describe("a new subscription is authorised and paid", () => {
  it("activates, issues invoice 0001 of the financial year, sets Business.plan, and emails 'started'", async () => {
    const s = await sub();
    expect(await onAuthorised(s.cashfreeSubscriptionId, { method: "upi", now: T0 })).toBe("activated");
    expect(s.state).toBe("ACTIVE");
    expect(s.currentPeriodEnd.toISOString()).toBe("2026-12-17T06:00:00.000Z");
    expect(s.nextChargeAt.toISOString()).toBe("2026-12-17T06:00:00.000Z");
    expect(biz()).toMatchObject({ plan: "professional", planStatus: "active" });
    expect(mem.invoices).toHaveLength(1);
    expect(mem.invoices[0]).toMatchObject({ number: "CALVY/2026-27/0001", kind: "RECEIPT", amountMinor: 34900, gstMinor: 0, paymentKey: `first:${s.id}` });
    expect(mem.notices.map((n) => n.event)).toEqual(["subscription.started"]);
    expect(mem.notices[0].payload).toMatchObject({ planName: "Pro", intervalLabel: "monthly", invoiceNumber: "CALVY/2026-27/0001" });
  });
  it("is idempotent: the webhook and the return-page recheck can both report it", async () => {
    const s = await sub();
    await onAuthorised(s.cashfreeSubscriptionId, { now: T0 });
    expect(await onAuthorised(s.cashfreeSubscriptionId, { now: new Date(T0.getTime() + 5000) })).toBe("noop");
    expect(mem.invoices).toHaveLength(1);
    expect(mem.notices).toHaveLength(1);
  });
  it("with a GSTIN it is a TAX INVOICE with the GST line", async () => {
    process.env.CALVY_GSTIN = "29ABCDE1234F1Z5";
    const s = await sub();
    await onAuthorised(s.cashfreeSubscriptionId, { now: T0 });
    expect(mem.invoices[0]).toMatchObject({ kind: "TAX_INVOICE", gstRate: 18 });
    expect(mem.invoices[0].taxableMinor + mem.invoices[0].gstMinor).toBe(34900);
  });
  it("invoice numbers continue in sequence within the year and restart on 1 April", async () => {
    const a = await sub(); await onAuthorised(a.cashfreeSubscriptionId, { now: new Date("2027-03-31T10:00:00Z") });
    const b = await sub({ businessId: "b1", planId: "business", amountMinor: 79900, firstChargeMinor: 79900 }); await onAuthorised(b.cashfreeSubscriptionId, { now: new Date("2027-03-31T11:00:00Z") });
    const c = await sub(); await onAuthorised(c.cashfreeSubscriptionId, { now: new Date("2027-04-01T10:00:00Z") });
    expect(mem.invoices.map((i) => i.number)).toEqual(["CALVY/2026-27/0001", "CALVY/2026-27/0002", "CALVY/2027-28/0001"]);
  });
  it("a failed or expired authorisation ends the pending subscription and leaves the business alone", async () => {
    const s = await sub();
    const { onAuthFailed } = await import("@/lib/subscriptions/service");
    await onAuthFailed(s.cashfreeSubscriptionId);
    expect(s.state).toBe("ENDED");
    expect(biz().plan).toBe("free");
  });
  it("the e-mandate path authorises for 0, then the first charge (raised by the cron) activates it", async () => {
    const s = await sub({ method: "enach", firstChargeMinor: 34900 });
    expect(await onAuthorised(s.cashfreeSubscriptionId, { now: T0 })).toBe("authorised");
    expect(s.state).toBe("AUTHORISED");
    expect(biz().plan).toBe("free");
    const r = await processDueSubscriptions(new Date(T0.getTime() + 1000), client as never);
    expect(r.raised).toBe(1);
    expect(mem.charges[0]).toMatchObject({ amountMinor: 34900 });
    expect(await onChargeSucceeded(s.cashfreeSubscriptionId, { paymentId: s.chargePaymentId, amountMinor: 34900, now: new Date(T0.getTime() + 2000) })).toBe("activated");
    expect(s.state).toBe("ACTIVE");
    expect(biz().plan).toBe("professional");
  });
});

describe("renewals", () => {
  async function active() {
    const s = await sub();
    await onAuthorised(s.cashfreeSubscriptionId, { now: T0 });
    mem.notices = [];
    return s;
  }
  it("a charge is raised a day before the period ends, once, with Calvy's own payment id", async () => {
    const s = await active();
    expect((await processDueSubscriptions(new Date(T0.getTime() + 10 * DAY), client as never)).raised).toBe(0);
    const near = new Date(s.nextChargeAt.getTime() - 3_600_000);
    expect((await processDueSubscriptions(near, client as never)).raised).toBe(1);
    expect(mem.charges[0]).toMatchObject({ amountMinor: 34900 });
    expect(mem.charges[0].paymentId).toMatch(new RegExp(`^calvy_ch_${s.id}_`));
    expect((await processDueSubscriptions(near, client as never)).raised).toBe(0); // not raised twice
  });
  it("a successful renewal extends the period from the old end (no drift), invoices once, and is idempotent", async () => {
    const s = await active();
    await processDueSubscriptions(new Date(s.nextChargeAt.getTime() - 3_600_000), client as never);
    const id = s.chargePaymentId;
    const end0 = s.currentPeriodEnd;
    expect(await onChargeSucceeded(s.cashfreeSubscriptionId, { paymentId: id, amountMinor: 34900, now: new Date(end0.getTime() + 60_000) })).toBe("renewed");
    expect(s.currentPeriodStart).toEqual(end0);
    expect(s.currentPeriodEnd.toISOString()).toBe("2027-01-17T06:00:00.000Z");
    expect(mem.invoices).toHaveLength(2);
    expect(await onChargeSucceeded(s.cashfreeSubscriptionId, { paymentId: id, amountMinor: 34900 })).toBe("noop");
    expect(mem.invoices).toHaveLength(2);
  });
  it("the authorisation payment reported again as a payment never becomes a second invoice", async () => {
    const s = await active();
    expect(await onChargeSucceeded(s.cashfreeSubscriptionId, { paymentId: "cf_auth_payment_1", amountMinor: 34900 })).toBe("noop");
    expect(mem.invoices).toHaveLength(1);
  });
  it("a paid amount that is not what we asked for is not applied", async () => {
    const s = await active();
    await processDueSubscriptions(new Date(s.nextChargeAt.getTime() - 3_600_000), client as never);
    expect(await onChargeSucceeded(s.cashfreeSubscriptionId, { paymentId: s.chargePaymentId, amountMinor: 100 })).toBe("amount_mismatch");
    expect(mem.invoices).toHaveLength(1);
  });
});

describe("cancel and downgrade take effect at the end of the period", () => {
  async function active(over: any = {}) {
    const s = await sub(over);
    await onAuthorised(s.cashfreeSubscriptionId, { now: T0 });
    mem.notices = [];
    return s;
  }
  it("cancel: access continues to the period end, nothing more is charged, then Basic", async () => {
    const s = await active();
    expect((await scheduleChange({ businessId: "b1", action: "cancel", now: T0 })).ok).toBe(true);
    expect(mem.notices.map((n) => n.event)).toEqual(["subscription.cancelled"]);
    const near = new Date(s.nextChargeAt.getTime() - 3_600_000);
    const r = await processDueSubscriptions(near, client as never);
    expect(r.ended).toBe(1);
    expect(mem.charges).toHaveLength(0);
    expect(mem.cancelled).toContain(s.cashfreeSubscriptionId);
    expect(s.state).toBe("ENDED");
    expect(biz().plan).toBe("professional"); // paid period not over yet
    await processDueSubscriptions(new Date(s.currentPeriodEnd.getTime() + 60_000), client as never);
    expect(biz()).toMatchObject({ plan: "free", planStatus: "free" });
  });
  it("undo removes a scheduled cancel", async () => {
    const s = await active();
    await scheduleChange({ businessId: "b1", action: "cancel", now: T0 });
    await scheduleChange({ businessId: "b1", action: "undo" });
    expect(s.pendingPlanId).toBeNull();
  });
  it("downgrade: the cheaper plan starts at the renewal and is charged its own price on the same mandate", async () => {
    const s = await active({ planId: "business", amountMinor: 79900, firstChargeMinor: 79900 });
    expect((await scheduleChange({ businessId: "b1", action: "downgrade", planId: "professional", interval: "MONTHLY", now: T0 })).ok).toBe(true);
    expect(mem.notices[0].event).toBe("subscription.downgrade_scheduled");
    await processDueSubscriptions(new Date(s.nextChargeAt.getTime() - 3_600_000), client as never);
    expect(s.planId).toBe("professional");
    expect(s.amountMinor).toBe(34900);
    expect(mem.charges[0].amountMinor).toBe(34900);
  });
  it("an upgrade can't be scheduled as a downgrade", async () => {
    await active();
    const r = await scheduleChange({ businessId: "b1", action: "downgrade", planId: "business", interval: "MONTHLY" });
    expect(r).toMatchObject({ ok: false, status: 409 });
  });
});

describe("upgrade: starts now with the prorated credit", () => {
  it("quotes the credit, creates the new mandate for price - credit, and ends the old subscription when the new one is paid", async () => {
    const old = await sub();
    await onAuthorised(old.cashfreeSubscriptionId, { now: T0 });
    mem.notices = [];
    const now = new Date(T0.getTime() + 15 * DAY); // about half of the period used
    client.createSubscription.mockResolvedValue({ subscriptionId: "x", cfSubscriptionId: "9", sessionId: "sess", status: "INITIALIZED" });
    const r = await startCheckout({ businessId: "b1", planId: "business", interval: "MONTHLY", method: "upi_card", now, client: client as never });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const left = old.currentPeriodEnd.getTime() - now.getTime(), total = old.currentPeriodEnd.getTime() - old.currentPeriodStart.getTime();
    const exactCredit = (34900 * left) / total;
    expect(r.quote.creditMinor).toBeGreaterThanOrEqual(exactCredit);
    expect(r.quote.creditMinor - exactCredit).toBeLessThan(1);
    expect(r.quote.dueMinor).toBe(79900 - r.quote.creditMinor);
    const call = client.createSubscription.mock.calls[0][0];
    expect(call).toMatchObject({ maxAmountMinor: 79900, authorizationAmountMinor: r.quote.dueMinor, methods: ["upi", "card"] });

    const created = mem.subs.find((x) => x.upgradeOfId === old.id)!;
    expect(created).toMatchObject({ state: "PENDING", creditMinor: r.quote.creditMinor, firstChargeMinor: r.quote.dueMinor });
    expect(biz().plan).toBe("professional"); // nothing changes until it is paid
    await onAuthorised(created.cashfreeSubscriptionId, { method: "upi", now });
    expect(created.state).toBe("ACTIVE");
    expect(old.state).toBe("ENDED");
    expect(old.endedReason).toBe("upgraded");
    expect(mem.cancelled).toContain(old.cashfreeSubscriptionId);
    expect(biz().plan).toBe("business");
    const inv = mem.invoices.find((i) => i.subscriptionId === created.id)!;
    expect(inv).toMatchObject({ grossMinor: 79900, creditMinor: r.quote.creditMinor, amountMinor: r.quote.dueMinor });
    expect(mem.notices[0].payload).toMatchObject({ kind: "upgraded", creditLabel: expect.stringContaining("₹") });
  });
  it("refuses outside India, without a phone, for the same plan, and when plan payments are not configured", async () => {
    mem.business.b1.currency = "USD";
    expect(await startCheckout({ businessId: "b1", planId: "professional", interval: "MONTHLY", method: "upi_card", client: client as never })).toMatchObject({ ok: false, status: 403 });
    mem.business.b1.currency = "INR"; mem.business.b1.phone = null;
    expect(await startCheckout({ businessId: "b1", planId: "professional", interval: "MONTHLY", method: "upi_card", client: client as never })).toMatchObject({ ok: false, status: 400 });
    mem.business.b1.phone = "9999999999";
    expect(await startCheckout({ businessId: "b1", planId: "professional", interval: "MONTHLY", method: "upi_card", client: null })).toMatchObject({ ok: false, status: 503 });
    const s = await sub(); await onAuthorised(s.cashfreeSubscriptionId, { now: T0 });
    expect(await startCheckout({ businessId: "b1", planId: "professional", interval: "MONTHLY", method: "upi_card", client: client as never })).toMatchObject({ ok: false, status: 409 });
  });
});

describe("failed payments: retries, 3 dunning emails, 7-day grace, then Basic", () => {
  async function activeThenFail() {
    const s = await sub();
    await onAuthorised(s.cashfreeSubscriptionId, { now: T0 });
    mem.notices = [];
    await processDueSubscriptions(new Date(s.nextChargeAt.getTime() - 3_600_000), client as never);
    const failAt = new Date(s.nextChargeAt.getTime());
    expect(await onChargeFailed(s.cashfreeSubscriptionId, failAt)).toBe("past_due");
    return { s, failAt };
  }
  it("the first failure starts the grace, keeps paid features on, and sends dunning email 1 at once", async () => {
    const { s, failAt } = await activeThenFail();
    expect(s.state).toBe("PAST_DUE");
    expect(s.graceUntil.getTime() - failAt.getTime()).toBe(7 * DAY);
    expect(biz().plan).toBe("professional");
    expect(mem.notices.map((n) => n.event)).toEqual(["subscription.payment_failed_1"]);
  });
  it("retries the charge on days 2 and 5, emails on days 3 and 6, then downgrades to Basic after day 7 with data kept", async () => {
    const { s, failAt } = await activeThenFail();
    const at = (d: number) => new Date(failAt.getTime() + d * DAY + 1000);
    expect((await processDueSubscriptions(at(1), client as never)).retried).toBe(0);
    expect((await processDueSubscriptions(at(2), client as never)).retried).toBe(1);
    s.chargePaymentId = null; // the retry failed again
    expect((await processDueSubscriptions(at(3), client as never)).dunning).toBe(1);
    s.chargePaymentId = null;
    expect((await processDueSubscriptions(at(5), client as never)).retried).toBe(1);
    s.chargePaymentId = null;
    expect((await processDueSubscriptions(at(6), client as never)).dunning).toBe(1);
    expect(mem.notices.map((n) => n.event)).toEqual(["subscription.payment_failed_1", "subscription.payment_failed_2", "subscription.payment_failed_3"]);
    expect(biz().plan).toBe("professional"); // still inside the grace
    const r = await processDueSubscriptions(at(7.5), client as never);
    expect(r.ended).toBe(1);
    expect(s.state).toBe("ENDED");
    expect(biz()).toMatchObject({ plan: "free", planStatus: "free" });
    expect(mem.notices.at(-1)!.event).toBe("subscription.downgraded");
    expect(mem.cancelled).toContain(s.cashfreeSubscriptionId);
  });
  it("a retry that succeeds ends the failure state and clears the grace", async () => {
    const { s, failAt } = await activeThenFail();
    await processDueSubscriptions(new Date(failAt.getTime() + 2 * DAY + 1000), client as never);
    expect(await onChargeSucceeded(s.cashfreeSubscriptionId, { paymentId: s.chargePaymentId, amountMinor: 34900, now: new Date(failAt.getTime() + 2 * DAY + 5000) })).toBe("renewed");
    expect(s).toMatchObject({ state: "ACTIVE", failedCount: 0, firstFailedAt: null, graceUntil: null, dunningSent: 0 });
  });
  it("dunning emails are never sent twice, even if the cron runs again", async () => {
    const { failAt } = await activeThenFail();
    const t = new Date(failAt.getTime() + 3 * DAY + 1000);
    await processDueSubscriptions(t, client as never);
    await processDueSubscriptions(t, client as never);
    expect(mem.notices.filter((n) => n.event === "subscription.payment_failed_2")).toHaveLength(1);
  });
});

describe("Business.plan: subscription is the source of truth, the admin override always wins", () => {
  it("while an override is active the subscription never changes the plan, but what the business goes back to stays current", async () => {
    const s = await sub();
    Object.assign(biz(), { plan: "business", planStatus: "active", planOverridePlan: "business", planOverrideUntil: new Date(T0.getTime() + 30 * DAY), planOverrideFromPlan: "free", planOverrideFromStatus: "free" });
    await onAuthorised(s.cashfreeSubscriptionId, { now: T0 });
    expect(biz()).toMatchObject({ plan: "business", planStatus: "active", planOverrideFromPlan: "professional", planOverrideFromStatus: "active" });
    expect(await applySubscriptionState(fake, "b1", T0)).toBe("override");
  });
  it("an expired override no longer blocks it", async () => {
    const s = await sub();
    await onAuthorised(s.cashfreeSubscriptionId, { now: T0 });
    Object.assign(biz(), { plan: "business", planOverridePlan: "business", planOverrideUntil: new Date(T0.getTime() - DAY) });
    expect(await applySubscriptionState(fake, "b1", T0)).toBe("applied");
    expect(biz().plan).toBe("professional");
  });
  it("a business with no subscription is never touched (admin-managed plans stay as they are)", async () => {
    Object.assign(biz(), { plan: "professional", planStatus: "active" });
    expect(await applySubscriptionState(fake, "b1", T0)).toBe("none");
    expect(biz().plan).toBe("professional");
  });
  it("a mandate cancelled in the customer's bank app ends the subscription but keeps access to the end of the paid period", async () => {
    const s = await sub();
    await onAuthorised(s.cashfreeSubscriptionId, { now: T0 });
    await onMandateEnded(s.cashfreeSubscriptionId, new Date(T0.getTime() + 5 * DAY));
    expect(s.state).toBe("ENDED");
    expect(biz().plan).toBe("professional");
  });
});
