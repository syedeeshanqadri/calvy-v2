import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { createHash, createHmac } from "node:crypto";
import { createRazorpayProvider, parseRazorpayWebhook, razorpaySignature, buildRazorpayLink } from "@/lib/payments/razorpay";
import { createPhonePeProvider, parsePhonePeWebhook, phonepeWebhookHash } from "@/lib/payments/phonepe";
import { createCashfreeProvider, cashfreeSignature } from "@/lib/payments/cashfree";
import { encryptCredentials, modeMismatch, providerForGateway, verifyGateway, gatewayWebhookUrl, maskKey } from "@/lib/payments/gateways";
import { applyPaymentEvent, type PaymentEventStore } from "@/lib/payments/events";
import { canUseOwnGateway } from "@/lib/payments/access";
import { GATEWAY_LIST } from "@/lib/payments/gatewayMeta";
import type { PaymentEvent } from "@/lib/payments/provider";

beforeEach(() => { process.env.NEXTAUTH_SECRET = "test-secret"; });

const order = {
  orderId: "calvy_a1", amountMinor: 50000, currency: "inr",
  customer: { id: "c1", name: "Riya", email: "r@x.com", phone: "9800000001" },
  returnUrl: "https://calvy.io/booking/return?order_id={order_id}",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("Razorpay (the business's own account)", () => {
  it("verify: a lightweight authenticated call; 401 is a clear error with no keys in it", async () => {
    const ok = vi.fn(async () => json({ items: [] }));
    expect(await createRazorpayProvider({ keyId: "rzp_test_abc", keySecret: "shh" }, ok as unknown as typeof fetch).verify!()).toEqual({ ok: true });
    const [url, init] = ok.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.razorpay.com/v1/payments?count=1");
    expect((init.headers as Record<string, string>).Authorization).toBe("Basic " + Buffer.from("rzp_test_abc:shh").toString("base64"));
    const bad = await createRazorpayProvider({ keyId: "rzp_test_abc", keySecret: "shh" }, (async () => json({ error: { description: "Authentication failed" } }, 401)) as unknown as typeof fetch).verify!();
    expect(bad.ok).toBe(false);
    expect(JSON.stringify(bad)).not.toMatch(/rzp_test_abc|shh/);
  });
  it("creates a payment link with our order id as the reference, integer paise, and the return url", async () => {
    const f = vi.fn(async () => json({ id: "plink_1", short_url: "https://rzp.io/i/x", expire_by: 1900000000 }));
    const r = await createRazorpayProvider({ keyId: "k", keySecret: "s" }, f as unknown as typeof fetch).createOrder({ ...order, expiresAt: new Date(Date.now() + 600_000) });
    expect(r).toMatchObject({ providerOrderId: "calvy_a1", gatewayRef: "plink_1", sessionId: "https://rzp.io/i/x", redirect: true });
    const body = JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body).toMatchObject({ amount: 50000, currency: "INR", reference_id: "calvy_a1", callback_url: "https://calvy.io/booking/return?order_id=calvy_a1" });
    expect(Number.isInteger(body.amount)).toBe(true);
    expect(body.expire_by * 1000).toBeGreaterThan(Date.now() + 15 * 60_000);
  });
  it("webhook: valid signature on the RAW body is accepted; a wrong secret or edited body is rejected", () => {
    const raw = JSON.stringify({ event: "payment_link.paid", payload: { payment_link: { entity: { reference_id: "calvy_a1", amount_paid: 50000 } }, payment: { entity: { id: "pay_1", method: "upi", amount: 50000 } } } });
    const h = (sig: string) => new Headers({ "x-razorpay-signature": sig, "x-razorpay-event-id": "evt_1" });
    expect(parseRazorpayWebhook(raw, h(razorpaySignature(raw, "whsec")), "whsec")).toMatchObject({ eventId: "evt_1", kind: "PAID", providerOrderId: "calvy_a1", amountMinor: 50000, method: "upi", paymentRef: "pay_1" });
    expect(parseRazorpayWebhook(raw, h(razorpaySignature(raw, "other")), "whsec")).toBeNull();
    expect(parseRazorpayWebhook(raw + " ", h(razorpaySignature(raw, "whsec")), "whsec")).toBeNull();
    expect(parseRazorpayWebhook(raw, new Headers(), "whsec")).toBeNull();
    expect(parseRazorpayWebhook(raw, h(razorpaySignature(raw, "whsec")), "")).toBeNull();
  });
  it("refund: finds the payment on the link, then refunds integer paise with our refund id as the receipt", async () => {
    const f = vi.fn(async (url: string) => String(url).includes("/refund") ? json({ id: "rfnd_1" }) : json({ payments: [{ payment_id: "pay_9" }] }));
    const r = await createRazorpayProvider({ keyId: "k", keySecret: "s" }, f as unknown as typeof fetch).refund({ providerOrderId: "calvy_a1", gatewayRef: "plink_1", refundId: "refund_p1", amountMinor: 50000, note: "x" });
    expect(r).toEqual({ refundRef: "rfnd_1" });
    expect(String((f.mock.calls[1] as unknown as [string])[0])).toBe("https://api.razorpay.com/v1/payments/pay_9/refund");
    expect(JSON.parse(String((f.mock.calls[1] as unknown as [string, RequestInit])[1].body))).toMatchObject({ amount: 50000, receipt: "refund_p1" });
  });
  it("order state maps the link status", async () => {
    const st = (status: string) => createRazorpayProvider({ keyId: "k", keySecret: "s" }, (async () => json({ status })) as unknown as typeof fetch).getOrderState("calvy_a1", "plink_1");
    expect(await st("paid")).toBe("PAID");
    expect(await st("created")).toBe("ACTIVE");
    expect(await st("expired")).toBe("EXPIRED");
    expect(buildRazorpayLink(order).amount).toBe(50000);
  });
});

describe("PhonePe PG (the business's own account)", () => {
  const cfg = { clientId: "cid", clientSecret: "csec", clientVersion: "1", mode: "TEST" as const, webhookCredentials: "user:pass" };
  it("verify = a client-credentials sign-in; wrong credentials give a reason without secrets", async () => {
    const f = vi.fn(async () => json({ access_token: "tok", expires_at: Math.floor(Date.now() / 1000) + 600 }));
    expect(await createPhonePeProvider(cfg, f as unknown as typeof fetch).verify!()).toEqual({ ok: true });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token");
    expect(String(init.body)).toContain("grant_type=client_credentials");
    const bad = await createPhonePeProvider(cfg, (async () => json({ message: "bad" }, 401)) as unknown as typeof fetch).verify!();
    expect(bad.ok).toBe(false);
    expect(JSON.stringify(bad)).not.toMatch(/csec|cid/);
  });
  it("creates a checkout order with our id and integer paise, then returns the redirect url", async () => {
    const f = vi.fn(async (url: string) => String(url).includes("oauth") ? json({ access_token: "tok", expires_at: Math.floor(Date.now() / 1000) + 600 }) : json({ orderId: "OM1", redirectUrl: "https://mercury.phonepe.com/x" }));
    const r = await createPhonePeProvider(cfg, f as unknown as typeof fetch).createOrder({ ...order, expiresAt: new Date(Date.now() + 900_000) });
    expect(r).toMatchObject({ providerOrderId: "calvy_a1", gatewayRef: "OM1", sessionId: "https://mercury.phonepe.com/x", redirect: true });
    const [url, init] = f.mock.calls[1] as unknown as [string, RequestInit];
    expect(url).toBe("https://api-preprod.phonepe.com/apis/pg-sandbox/checkout/v2/pay");
    expect((init.headers as Record<string, string>).Authorization).toBe("O-Bearer tok");
    expect(JSON.parse(String(init.body))).toMatchObject({ merchantOrderId: "calvy_a1", amount: 50000 });
  });
  it("webhook: Authorization must be SHA256(username:password); anything else is rejected", () => {
    const raw = JSON.stringify({ event: "checkout.order.completed", payload: { merchantOrderId: "calvy_a1", orderId: "OM1", state: "COMPLETED", amount: 50000, paymentDetails: [{ transactionId: "T1", paymentMode: "UPI_INTENT" }] } });
    const hdr = (v: string) => new Headers({ authorization: v });
    const good = createHash("sha256").update("user:pass").digest("hex");
    expect(phonepeWebhookHash("user:pass")).toBe(good);
    expect(parsePhonePeWebhook(raw, hdr(good), "user:pass")).toMatchObject({ kind: "PAID", providerOrderId: "calvy_a1", amountMinor: 50000, paymentRef: "T1" });
    expect(parsePhonePeWebhook(raw, hdr("SHA256 " + good), "user:pass")).not.toBeNull();
    expect(parsePhonePeWebhook(raw, hdr(createHash("sha256").update("user:other").digest("hex")), "user:pass")).toBeNull();
    expect(parsePhonePeWebhook(raw, new Headers(), "user:pass")).toBeNull();
  });
  it("refund posts our refund id and the original order id", async () => {
    const f = vi.fn(async (url: string) => String(url).includes("oauth") ? json({ access_token: "tok" }) : json({ refundId: "RF1" }));
    expect(await createPhonePeProvider(cfg, f as unknown as typeof fetch).refund({ providerOrderId: "calvy_a1", refundId: "refund_p1", amountMinor: 50000 })).toEqual({ refundRef: "RF1" });
    expect(JSON.parse(String((f.mock.calls[1] as unknown as [string, RequestInit])[1].body))).toEqual({ merchantRefundId: "refund_p1", originalMerchantOrderId: "calvy_a1", amount: 50000 });
  });
});

describe("Cashfree as the business's own gateway", () => {
  it("verify: 404 on the probe order means the keys were accepted; 401 means they were not", async () => {
    expect(await createCashfreeProvider({ appId: "a", secretKey: "s", env: "sandbox" }, (async () => json({ message: "order not found" }, 404)) as unknown as typeof fetch).verify!()).toEqual({ ok: true });
    const bad = await createCashfreeProvider({ appId: "a", secretKey: "s", env: "sandbox" }, (async () => json({ message: "auth" }, 401)) as unknown as typeof fetch).verify!();
    expect(bad.ok).toBe(false);
  });
  it("webhook is signed with THEIR secret key (verified through the stored gateway)", () => {
    const row = { provider: "CASHFREE", mode: "TEST", ...encryptCredentials({ keyId: "app", keySecret: "their-secret" }) };
    const p = providerForGateway(row);
    const raw = JSON.stringify({ type: "PAYMENT_SUCCESS_WEBHOOK", data: { order: { order_id: "calvy_a1" }, payment: { cf_payment_id: 7, payment_amount: 500, payment_group: "upi" } } });
    const ts = "1700000000";
    const headers = (key: string) => new Headers({ "x-webhook-signature": cashfreeSignature(ts, raw, key), "x-webhook-timestamp": ts });
    expect(p.verifyWebhook(raw, headers("their-secret"))).toMatchObject({ kind: "PAID", providerOrderId: "calvy_a1", amountMinor: 50000 });
    expect(p.verifyWebhook(raw, headers("calvy-own-secret"))).toBeNull();
  });
});

describe("stored gateways", () => {
  it("credentials are encrypted at rest and decrypt only inside the adapter", () => {
    const e = encryptCredentials({ keyId: "rzp_test_abcdef", keySecret: "the-secret", webhookSecret: "whsec" });
    expect(JSON.stringify(e)).not.toMatch(/rzp_test_abcdef|the-secret|whsec/);
    expect(providerForGateway({ provider: "RAZORPAY", mode: "TEST", ...e }).name).toBe("RAZORPAY");
  });
  it("verifyGateway never throws and never leaks a key in its reason", async () => {
    const e = encryptCredentials({ keyId: "rzp_test_abcdef", keySecret: "the-secret" });
    const r = await verifyGateway({ provider: "RAZORPAY", mode: "TEST", ...e }, (async () => { throw new Error("boom the-secret"); }) as unknown as typeof fetch);
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toMatch(/the-secret|rzp_test_abcdef/);
    expect((await verifyGateway({ provider: "RAZORPAY", mode: "TEST", keyIdEnc: "garbage", keySecretEnc: "garbage", webhookSecretEnc: null, extra: null })).ok).toBe(false);
  });
  it("a live key saved as test mode (or the reverse) is refused before any call", () => {
    expect(modeMismatch("RAZORPAY", "TEST", "rzp_live_x")).toMatch(/live key/);
    expect(modeMismatch("RAZORPAY", "LIVE", "rzp_test_x")).toMatch(/test key/);
    expect(modeMismatch("RAZORPAY", "TEST", "rzp_test_x")).toBeNull();
    expect(modeMismatch("CASHFREE", "TEST", "anything")).toBeNull();
  });
  it("the webhook URL carries the random key and the key is masked in the UI", () => {
    expect(gatewayWebhookUrl("abc123", { NEXT_PUBLIC_APP_URL: "https://calvy.io" })).toBe("https://calvy.io/api/payments/webhook/abc123");
    expect(maskKey("rzp_test_ABCDEFGH123")).toBe("rzp_test…123");
    expect(maskKey("short")).toBe("••••");
  });
  it("adding a provider is one meta entry: Razorpay, Cashfree and PhonePe are listed with guides and fields", () => {
    expect(GATEWAY_LIST.map((g) => g.id).sort()).toEqual(["CASHFREE", "PHONEPE", "RAZORPAY"]);
    for (const g of GATEWAY_LIST) {
      expect(g.guide.steps.length).toBeGreaterThan(1);
      expect(g.guide.links.length).toBeGreaterThan(0);
      expect(g.fields.some((f) => f.secret)).toBe(true);
    }
  });
});

describe("webhook idempotency and scoping", () => {
  function memStore(payments: { id: string; status: "CREATED" | "PAID"; amountMinor: number; gatewayId: string | null; orderId: string }[]) {
    const events = new Set<string>();
    const updates: string[] = [];
    const store: PaymentEventStore<null> = {
      transaction: (fn) => fn(null),
      recordEvent: async (_t, provider, e) => { const k = `${provider}:${e.eventId}`; if (events.has(k)) return false; events.add(k); return true; },
      findPayment: async (_t, _p, orderId, gatewayId) => payments.find((p) => p.orderId === orderId && (gatewayId === undefined || p.gatewayId === gatewayId)) ?? null,
      updatePayment: async (_t, id) => { updates.push(id); },
    };
    return { store, updates, events };
  }
  const evt: PaymentEvent = { eventId: "e1", kind: "PAID", providerOrderId: "calvy_a1", amountMinor: 50000, method: "upi", paymentRef: "p1" };

  it("a redelivered event is applied once", async () => {
    const m = memStore([{ id: "pay1", status: "CREATED", amountMinor: 50000, gatewayId: "g1", orderId: "calvy_a1" }]);
    expect((await applyPaymentEvent(m.store, "RAZORPAY", evt, { gatewayId: "g1" })).result).toBe("updated");
    expect((await applyPaymentEvent(m.store, "RAZORPAY", evt, { gatewayId: "g1" })).result).toBe("duplicate");
    expect(m.updates).toEqual(["pay1"]);
  });
  it("a business's webhook can only touch ITS gateway's payments (signed with their own secret, but not for someone else's order)", async () => {
    const m = memStore([{ id: "pay1", status: "CREATED", amountMinor: 50000, gatewayId: "g-other", orderId: "calvy_a1" }]);
    expect((await applyPaymentEvent(m.store, "RAZORPAY", evt, { gatewayId: "g-mine" })).result).toBe("unknown_order");
    expect(m.updates).toEqual([]);
  });
  it("Calvy's own Cashfree webhook (scope null) never settles a business-gateway payment", async () => {
    const m = memStore([{ id: "pay1", status: "CREATED", amountMinor: 50000, gatewayId: "g1", orderId: "calvy_a1" }]);
    expect((await applyPaymentEvent(m.store, "CASHFREE", evt, { gatewayId: null })).result).toBe("unknown_order");
  });
  it("event ids are namespaced per gateway so two businesses' ids can never collide", async () => {
    const m = memStore([{ id: "pay1", status: "CREATED", amountMinor: 50000, gatewayId: "g1", orderId: "calvy_a1" }, { id: "pay2", status: "CREATED", amountMinor: 50000, gatewayId: "g2", orderId: "calvy_a2" }]);
    await applyPaymentEvent(m.store, "RAZORPAY", evt, { gatewayId: "g1" });
    expect((await applyPaymentEvent(m.store, "RAZORPAY", { ...evt, providerOrderId: "calvy_a2" }, { gatewayId: "g2" })).result).toBe("updated");
  });
  it("an amount that differs from the order is not applied", async () => {
    const m = memStore([{ id: "pay1", status: "CREATED", amountMinor: 50000, gatewayId: "g1", orderId: "calvy_a1" }]);
    expect((await applyPaymentEvent(m.store, "RAZORPAY", { ...evt, amountMinor: 100 }, { gatewayId: "g1" })).result).toBe("amount_mismatch");
  });
});

describe("plan gating", () => {
  it("only Mid/Top (no Rs 10 fee) may connect a gateway; Basic never", () => {
    expect(canUseOwnGateway({ platformFeeMinorIN: 1000 })).toBe(false);
    expect(canUseOwnGateway({ platformFeeMinorIN: 0 })).toBe(true);
  });
});

describe("no secrets in logs", () => {
  it("adapters and routes never log or interpolate credentials", async () => {
    const { readFileSync } = await import("node:fs");
    for (const f of ["lib/payments/razorpay.ts", "lib/payments/phonepe.ts", "lib/payments/gateways.ts", "app/api/settings/gateways/route.ts", "app/api/settings/gateways/[id]/route.ts", "app/api/payments/webhook/[key]/route.ts"]) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/logger\.\w+\([^)]*(keySecret|clientSecret|webhookSecret|password)/);
      expect(src, f).not.toMatch(/console\.(log|error|warn)/);
    }
  });
  it("hmac helper sanity (guards the test itself)", () => {
    expect(createHmac("sha256", "k").update("x").digest("hex")).toHaveLength(64);
  });
});
