import { describe, it, expect, vi } from "vitest";
import { computeCharge, countryFromCurrency, toMinor, type ChargeInput } from "@/lib/fees";
import { buildOrderBody, cashfreeSignature, createCashfreeProvider, parseCashfreeWebhook } from "@/lib/payments/cashfree";
import { createMockProvider } from "@/lib/payments/mock";
import { applyPaymentEvent, nextPayStatus, type PayStatus, type PaymentEventStore } from "@/lib/payments/events";
import { getPaymentProvider } from "@/lib/payments";
import type { PaymentEvent } from "@/lib/payments/provider";

describe("fee matrix", () => {
  const base: ChargeInput = { country: "IN", platformFeeMinorIN: 1000, mode: "FULL_ONLINE", payer: "CUSTOMER", priceMinor: 50000 };

  it("India Free, full online, customer pays the fee: 500 -> 510 / 500", () => {
    expect(computeCharge(base)).toEqual({ chargeMinor: 51000, platformFeeMinor: 1000, businessShareMinor: 50000 });
  });
  it("India Free, full online, business pays the fee: 500 -> 500 / 490", () => {
    expect(computeCharge({ ...base, payer: "BUSINESS" })).toEqual({ chargeMinor: 50000, platformFeeMinor: 1000, businessShareMinor: 49000 });
  });
  it("India Free, booking fee only: Rs 10 to Calvy, service paid at venue", () => {
    for (const payer of ["CUSTOMER", "BUSINESS"] as const) {
      expect(computeCharge({ ...base, mode: "BOOKING_FEE_ONLY", payer })).toEqual({ chargeMinor: 1000, platformFeeMinor: 1000, businessShareMinor: 0 });
    }
  });
  it("India paid plan: no fee; booking-fee-only charges nothing", () => {
    const paid = { ...base, platformFeeMinorIN: 0 };
    expect(computeCharge({ ...paid, mode: "BOOKING_FEE_ONLY" }).chargeMinor).toBe(0);
    expect(computeCharge(paid)).toEqual({ chargeMinor: 50000, platformFeeMinor: 0, businessShareMinor: 50000 });
    expect(computeCharge({ ...paid, payer: "BUSINESS" })).toEqual({ chargeMinor: 50000, platformFeeMinor: 0, businessShareMinor: 50000 });
  });
  it("international: never charged online, in either mode", () => {
    for (const mode of ["BOOKING_FEE_ONLY", "FULL_ONLINE"] as const) {
      expect(computeCharge({ ...base, country: "US", mode }).chargeMinor).toBe(0);
    }
  });
  it("business payer never gets a negative share (free service)", () => {
    expect(computeCharge({ ...base, payer: "BUSINESS", priceMinor: 0 })).toEqual({ chargeMinor: 0, platformFeeMinor: 0, businessShareMinor: 0 });
    expect(computeCharge({ ...base, payer: "BUSINESS", priceMinor: 500 })).toEqual({ chargeMinor: 500, platformFeeMinor: 500, businessShareMinor: 0 });
  });
  it("helpers", () => {
    expect(toMinor(499.99)).toBe(49999);
    expect(countryFromCurrency("inr")).toBe("IN");
    expect(countryFromCurrency("USD")).toBe("US");
    expect(countryFromCurrency(null)).toBe("US");
  });
});

const order = {
  orderId: "calvy_abc123", amountMinor: 51000, currency: "inr",
  customer: { id: "cl_1", name: "Riya Kapoor", email: "riya@example.com", phone: "9800000001" },
  returnUrl: "https://calvy.io/booking/return?order_id={order_id}",
};

describe("cashfree adapter", () => {
  it("builds the order body Cashfree expects (rupees, upper-case currency)", () => {
    expect(buildOrderBody({ ...order, notifyUrl: "https://calvy.io/api/payments/cashfree/webhook", tags: { appointmentId: "a1" } })).toEqual({
      order_id: "calvy_abc123",
      order_amount: 510,
      order_currency: "INR",
      customer_details: { customer_id: "cl_1", customer_name: "Riya Kapoor", customer_email: "riya@example.com", customer_phone: "9800000001" },
      order_meta: { return_url: order.returnUrl, notify_url: "https://calvy.io/api/payments/cashfree/webhook" },
      order_tags: { appointmentId: "a1" },
    });
  });

  it("sends credentials as headers to the sandbox and returns the session id", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ order_id: "calvy_abc123", payment_session_id: "session_x", order_expiry_time: "2026-10-25T10:00:00+05:30" }), { status: 200 }));
    const cf = createCashfreeProvider({ appId: "app", secretKey: "sec", env: "sandbox" }, fetchMock as unknown as typeof fetch);
    const r = await cf.createOrder(order);
    expect(r).toMatchObject({ providerOrderId: "calvy_abc123", sessionId: "session_x" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://sandbox.cashfree.com/pg/orders");
    expect(init.headers).toMatchObject({ "x-client-id": "app", "x-client-secret": "sec", "x-api-version": "2023-08-01" });
  });

  it("errors never include the credentials", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ message: "authentication Failed" }), { status: 401 }));
    const cf = createCashfreeProvider({ appId: "app-id-123", secretKey: "secret-456", env: "sandbox" }, fetchMock as unknown as typeof fetch);
    const e = await cf.createOrder(order).catch((x: Error) => x);
    expect((e as Error).message).toContain("authentication Failed");
    expect((e as Error).message).not.toMatch(/app-id-123|secret-456/);
  });

  const secret = "test_secret";
  const body = JSON.stringify({
    type: "PAYMENT_SUCCESS_WEBHOOK",
    data: { order: { order_id: "calvy_abc123", order_amount: 510 }, payment: { cf_payment_id: 9876, payment_amount: 510, payment_group: "upi" } },
  });
  const signed = (b: string, ts = "1729760000000", s = secret) =>
    new Headers({ "x-webhook-timestamp": ts, "x-webhook-signature": cashfreeSignature(ts, b, s) });

  it("accepts a correctly signed webhook and normalises it", () => {
    expect(parseCashfreeWebhook(body, signed(body), secret)).toEqual({
      eventId: "PAYMENT_SUCCESS_WEBHOOK:9876", kind: "PAID", providerOrderId: "calvy_abc123",
      amountMinor: 51000, method: "upi", paymentRef: "9876",
    });
  });
  it("rejects a wrong secret, a tampered body, a changed timestamp and missing headers", () => {
    expect(parseCashfreeWebhook(body, signed(body, "1729760000000", "other"), secret)).toBeNull();
    expect(parseCashfreeWebhook(body.replace("510", "1"), signed(body), secret)).toBeNull();
    const h = signed(body);
    h.set("x-webhook-timestamp", "1729760000001");
    expect(parseCashfreeWebhook(body, h, secret)).toBeNull();
    expect(parseCashfreeWebhook(body, new Headers(), secret)).toBeNull();
  });
  it("maps failed and dropped events", () => {
    const failed = body.replace("PAYMENT_SUCCESS_WEBHOOK", "PAYMENT_FAILED_WEBHOOK");
    const dropped = body.replace("PAYMENT_SUCCESS_WEBHOOK", "PAYMENT_USER_DROPPED_WEBHOOK");
    expect(parseCashfreeWebhook(failed, signed(failed), secret)?.kind).toBe("FAILED");
    expect(parseCashfreeWebhook(dropped, signed(dropped), secret)?.kind).toBe("DROPPED");
  });
});

describe("mock provider contract", () => {
  it("create -> pay -> refund, and verifies its own webhooks only", async () => {
    const p = createMockProvider();
    const o = await p.createOrder(order);
    expect(o.sessionId).toContain(order.orderId);
    expect(await p.getOrderState(order.orderId)).toBe("ACTIVE");
    await expect(p.createOrder(order)).rejects.toThrow();
    await expect(p.refund({ providerOrderId: order.orderId, refundId: "r0", amountMinor: 100 })).rejects.toThrow();

    const { rawBody, headers } = p.simulate(order.orderId, "PAID");
    expect(p.verifyWebhook(rawBody, headers)).toMatchObject({ kind: "PAID", providerOrderId: order.orderId, amountMinor: 51000 });
    expect(p.verifyWebhook(rawBody, new Headers({ "x-mock-signature": "nope" }))).toBeNull();
    expect(await p.getOrderState(order.orderId)).toBe("PAID");

    await p.refund({ providerOrderId: order.orderId, refundId: "r1", amountMinor: 1000 });
    await expect(p.refund({ providerOrderId: order.orderId, refundId: "r2", amountMinor: 51000 })).rejects.toThrow();
  });
});

describe("provider selection", () => {
  it("Cashfree with keys, mock in dev without, none in production without", () => {
    expect(getPaymentProvider({ CASHFREE_APP_ID: "a", CASHFREE_SECRET_KEY: "b", NODE_ENV: "test" } as NodeJS.ProcessEnv)?.name).toBe("CASHFREE");
    expect(getPaymentProvider({ NODE_ENV: "development" } as NodeJS.ProcessEnv)?.name).toBe("MOCK");
    expect(getPaymentProvider({ NODE_ENV: "production" } as NodeJS.ProcessEnv)).toBeNull();
  });
});

describe("webhook idempotency", () => {
  function memoryStore(initial: PayStatus = "CREATED", amountMinor = 51000) {
    const events = new Set<string>();
    const payment = { id: "pay_1", providerOrderId: "calvy_abc123", status: initial, amountMinor, updates: 0 };
    const store: PaymentEventStore<null> = {
      transaction: (fn) => fn(null),
      async recordEvent(_tx, provider, e) {
        const k = `${provider}:${e.eventId}`;
        if (events.has(k)) return false;
        events.add(k);
        return true;
      },
      async findPayment(_tx, _p, id) { return id === payment.providerOrderId ? payment : null; },
      async updatePayment(_tx, _id, d) { payment.status = d.status; payment.updates++; },
    };
    return { store, payment };
  }
  const paid: PaymentEvent = { eventId: "PAYMENT_SUCCESS_WEBHOOK:1", kind: "PAID", providerOrderId: "calvy_abc123", amountMinor: 51000, method: "upi", paymentRef: "1" };

  it("applies an event once; a redelivery is a no-op", async () => {
    const { store, payment } = memoryStore();
    expect(await applyPaymentEvent(store, "CASHFREE", paid)).toMatchObject({ result: "updated", to: "PAID" });
    expect(await applyPaymentEvent(store, "CASHFREE", paid)).toEqual({ result: "duplicate" });
    expect(payment.updates).toBe(1);
  });
  it("a late failure never undoes a payment; a retry after failure can succeed", async () => {
    expect(nextPayStatus("PAID", { kind: "FAILED" })).toBeNull();
    expect(nextPayStatus("REFUNDED", { kind: "PAID" })).toBeNull();
    expect(nextPayStatus("CREATED", { kind: "DROPPED" })).toBeNull();
    expect(nextPayStatus("FAILED", { kind: "PAID" })).toBe("PAID");
  });
  it("refuses a PAID event whose amount differs from the order", async () => {
    const { store, payment } = memoryStore("CREATED", 1000);
    expect(await applyPaymentEvent(store, "CASHFREE", paid)).toMatchObject({ result: "amount_mismatch" });
    expect(payment.status).toBe("CREATED");
  });
  it("ignores events for orders we do not know", async () => {
    const { store } = memoryStore();
    expect(await applyPaymentEvent(store, "CASHFREE", { ...paid, providerOrderId: "other" })).toEqual({ result: "unknown_order" });
  });
});
