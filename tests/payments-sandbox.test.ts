import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Sandbox-ready payments: the webhook works through Vercel Deployment Protection (bypass in the query string, signature still
// checked on the raw body), previews use their own address, the health check says ready in sandbox, and the confirmation
// email rows commit in the SAME transaction that marks the booking paid.

const state = vi.hoisted(() => ({ inTx: false, enqueueInTx: [] as boolean[], enqueuedWith: [] as unknown[] }));
const tx = vi.hoisted(() => ({
  $executeRaw: vi.fn(async () => 1),
  payment: { findUnique: vi.fn() },
  appointment: { findUnique: vi.fn(), update: vi.fn() },
  client: { update: vi.fn() },
  platformFeeEntry: { create: vi.fn() },
}));
const db = vi.hoisted(() => ({ payment: { findFirst: vi.fn() }, $transaction: vi.fn(), appointment: { findUnique: vi.fn() } }));
const applyPaymentEvent = vi.hoisted(() => vi.fn(async () => ({ result: "updated" })));
const enqueue = vi.hoisted(() => vi.fn());
const ownerAlert = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/booking", () => ({ BOOKING_TX_OPTIONS: {} }));
vi.mock("@/lib/payments/events", () => ({ applyPaymentEvent }));
vi.mock("@/lib/payments/db", () => ({ prismaPaymentEventStore: {} }));
vi.mock("@/lib/payments", () => ({ getPaymentProvider: () => null }));
vi.mock("@/lib/notifications/enqueue", () => ({ enqueue, sendSoon: vi.fn(async () => {}), notify: vi.fn(async () => {}) }));
vi.mock("@/lib/notifications/business", () => ({ ownerAlert }));
vi.mock("@/lib/notifications/events", () => ({
  noticeFrom: () => ({ payload: { serviceName: "Consult" } }),
  confirmation: () => ({ template: "confirmation" }),
  receipt: () => ({ template: "invoice" }),
  serviceLabel: (n: string) => n,
}));
vi.mock("@/lib/push", () => ({ sendPushToBusiness: vi.fn(async () => {}) }));
vi.mock("@/lib/whatsapp", () => ({ sendBookingConfirmationWhatsApp: vi.fn(async () => {}) }));

import { cashfreeSignature } from "@/lib/payments/cashfree";
import { paymentBaseUrl, webhookUrlFor, webhookUrlForDisplay } from "@/lib/paymentUrls";
import { evaluatePaymentsHealth } from "@/lib/paymentsHealth";
import { POST as webhook } from "@/app/api/payments/cashfree/webhook/route";
import { settlePaidPayment } from "@/lib/onlinePayment";

const SECRET = "cfsk_test_secret";
const paidBody = JSON.stringify({ type: "PAYMENT_SUCCESS_WEBHOOK", data: { order: { order_id: "calvy_a1" }, payment: { cf_payment_id: 7, payment_amount: 10, payment_group: "upi" } } });
const post = (url: string, body: string, sig: string, ts = "1700000000000") =>
  webhook(new NextRequest(url, { method: "POST", headers: { "x-webhook-signature": sig, "x-webhook-timestamp": ts, "content-type": "application/json" }, body }));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CASHFREE_SECRET_KEY = SECRET;
  db.payment.findFirst.mockResolvedValue(null);
});

describe("webhook through Vercel Deployment Protection", () => {
  const ts = "1700000000000";
  const url = "https://calvy-git-x.vercel.app/api/payments/cashfree/webhook?x-vercel-protection-bypass=BYPASS123";
  it("accepts a correctly signed call that carries the bypass query parameter", async () => {
    const res = await post(url, paidBody, cashfreeSignature(ts, paidBody, SECRET), ts);
    expect(res.status).toBe(200);
    expect(applyPaymentEvent).toHaveBeenCalledTimes(1);
  });
  it("still checks the signature on the raw body: a bypass parameter proves nothing", async () => {
    expect((await post(url, paidBody, "forged", ts)).status).toBe(401);
    expect((await post(url, paidBody + " ", cashfreeSignature(ts, paidBody, SECRET), ts)).status).toBe(401); // body changed after signing
    expect((await post(url, paidBody, cashfreeSignature(ts, paidBody, "wrong-secret"), ts)).status).toBe(401);
    expect(applyPaymentEvent).not.toHaveBeenCalled();
  });
  it("refuses everything while no secret is configured (never fails open)", async () => {
    delete process.env.CASHFREE_SECRET_KEY;
    expect((await post(url, paidBody, "x", ts)).status).toBe(503);
  });
});

describe("where Cashfree sends the customer and the webhook", () => {
  it("a Vercel preview uses its own address and adds the bypass secret to the webhook URL only", () => {
    const env = { VERCEL_ENV: "preview", VERCEL_URL: "calvy-git-x.vercel.app", NEXT_PUBLIC_APP_URL: "https://calvy.io", VERCEL_AUTOMATION_BYPASS_SECRET: "S3CRET value" };
    expect(paymentBaseUrl(env)).toBe("https://calvy-git-x.vercel.app");
    expect(webhookUrlFor(env)).toBe("https://calvy-git-x.vercel.app/api/payments/cashfree/webhook?x-vercel-protection-bypass=S3CRET%20value");
    expect(webhookUrlForDisplay(env)).toBe("https://calvy-git-x.vercel.app/api/payments/cashfree/webhook"); // shown without the secret
  });
  it("a preview without the bypass secret still gets a plain https webhook URL", () => {
    expect(webhookUrlFor({ VERCEL_ENV: "preview", VERCEL_URL: "p.vercel.app" })).toBe("https://p.vercel.app/api/payments/cashfree/webhook");
  });
  it("production uses the configured URL and never the bypass secret", () => {
    const env = { VERCEL_ENV: "production", NEXT_PUBLIC_APP_URL: "https://calvy.io", VERCEL_URL: "x.vercel.app", VERCEL_AUTOMATION_BYPASS_SECRET: "S" };
    expect(paymentBaseUrl(env)).toBe("https://calvy.io");
    expect(webhookUrlFor(env)).toBe("https://calvy.io/api/payments/cashfree/webhook");
  });
  it("localhost has no webhook (Cashfree cannot reach it): the return page rechecks instead", () => {
    expect(webhookUrlFor({ NEXT_PUBLIC_APP_URL: "http://localhost:3000" })).toBeUndefined();
    expect(paymentBaseUrl({ PORT: "3100" })).toBe("http://localhost:3100");
  });
});

describe("go-live check in sandbox", () => {
  const base = { flagOn: true, provider: "CASHFREE", cashfreeEnv: "sandbox" as const, appUrl: "https://calvy-git-x.vercel.app", cronSecretSet: true, receiptCompanyDetailsSet: true, deployment: "preview" as const };
  it("is ready on a preview with sandbox keys", () => {
    expect(evaluatePaymentsHealth(base)).toMatchObject({ ready: true, mode: "sandbox", problems: [] });
  });
  it("is ready locally with sandbox keys; the http address and missing extras are only warnings", () => {
    const r = evaluatePaymentsHealth({ ...base, appUrl: "http://localhost:3000", cronSecretSet: false, receiptCompanyDetailsSet: false, deployment: "development" });
    expect(r.ready).toBe(true);
    expect(r.warnings.length).toBe(3);
  });
  it("is not ready when the flag is off, Cashfree is missing, or sandbox is on the production deployment", () => {
    expect(evaluatePaymentsHealth({ ...base, flagOn: false }).ready).toBe(false);
    expect(evaluatePaymentsHealth({ ...base, provider: "MOCK" }).ready).toBe(false);
    expect(evaluatePaymentsHealth({ ...base, deployment: "production", cashfreeEnv: "sandbox" }).problems.join(" ")).toContain("sandbox");
    expect(evaluatePaymentsHealth({ ...base, deployment: "production", cashfreeEnv: "production", appUrl: "http://x", cronSecretSet: false }).ready).toBe(false);
    expect(evaluatePaymentsHealth({ ...base, deployment: "production", cashfreeEnv: "production" }).ready).toBe(true);
  });
  it("live keys on a test deployment are a problem", () => {
    expect(evaluatePaymentsHealth({ ...base, cashfreeEnv: "production" }).ready).toBe(false);
  });
});

describe("the confirmation email commits with the PAID status", () => {
  const payment = { id: "p1", appointmentId: "a1", status: "PAID", businessId: "b1", amountMinor: 1000, platformFeeMinor: 1000, paymentRef: "77" };
  const appt = { id: "a1", status: "pending_payment", holdExpiresAt: new Date(Date.now() + 600_000), clientId: "c1", date: new Date(), business: { timezone: "Asia/Kolkata", currency: "INR" }, service: { name: "Consult" }, notes: null, client: { name: "Riya", phone: null }, tokenNumber: null, tokenSession: null, price: 500, businessId: "b1" };
  beforeEach(() => {
    state.inTx = false; state.enqueueInTx = []; state.enqueuedWith = [];
    tx.payment.findUnique.mockResolvedValue(payment);
    tx.appointment.findUnique.mockResolvedValue(appt);
    db.$transaction.mockImplementation(async (fn: (t: unknown) => unknown) => { state.inTx = true; try { return await fn(tx); } finally { state.inTx = false; } });
    enqueue.mockImplementation(async (d: unknown, items: unknown[]) => { state.enqueueInTx.push(state.inTx); state.enqueuedWith.push(d, items); return ["row1"]; });
    ownerAlert.mockImplementation(async () => ({ template: "alert" }));
  });
  it("writes the outbox rows on the transaction itself, before it commits", async () => {
    expect(await settlePaidPayment("p1")).toBe("confirmed");
    expect(tx.appointment.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "confirmed", paymentStatus: "paid" }) }));
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(state.enqueueInTx).toEqual([true]);       // called while the transaction was still open
    expect(state.enqueuedWith[0]).toBe(tx);          // on the transaction client, not the global one
    expect((state.enqueuedWith[1] as { template: string }[]).map((i) => i.template)).toEqual(["alert", "alert", "confirmation", "invoice"]);
  });
  it("a failure while building the emails never undoes the payment", async () => {
    ownerAlert.mockRejectedValue(new Error("prefs unavailable"));
    expect(await settlePaidPayment("p1")).toBe("confirmed");
    expect(tx.appointment.update).toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });
  it("a payment that is not settled yet, or a lapsed hold, queues no confirmation", async () => {
    tx.payment.findUnique.mockResolvedValue({ ...payment, status: "CREATED" });
    expect(await settlePaidPayment("p1")).toBe("noop");
    expect(enqueue).not.toHaveBeenCalled();
  });
});
