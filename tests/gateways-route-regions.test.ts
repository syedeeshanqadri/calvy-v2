import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({
  currency: "INR",
  fee: 0,
  created: [] as unknown[],
  db: {
    business: { findUnique: vi.fn() },
    paymentGateway: { create: vi.fn(), update: vi.fn(), count: vi.fn(async () => 0) },
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: m.db }));
vi.mock("@/lib/access", () => ({ accessSession: vi.fn(async () => ({ user: { id: "u1", businessId: "b1" } })) }));
vi.mock("@/lib/getFeatures", () => ({ getBusinessFeatures: vi.fn(async () => ({ platformFeeMinorIN: m.fee })) }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => {}) }));
vi.mock("@/lib/payments/gatewayStore", () => ({ gatewayView: (r: unknown) => r, listGateways: vi.fn(async () => []) }));
vi.mock("@/lib/payments/gateways", async (orig) => ({ ...(await orig<typeof import("@/lib/payments/gateways")>()), verifyGateway: vi.fn(async () => ({ ok: true })) }));

import { POST } from "@/app/api/settings/gateways/route";

const post = (body: unknown) => POST(new Request("http://x/api/settings/gateways", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) as never);

beforeEach(() => {
  process.env.NEXTAUTH_SECRET = "test-secret-test-secret-test-secret";
  process.env.NOTIFICATION_SECRET_KEY = process.env.NOTIFICATION_SECRET_KEY ?? "k".repeat(32);
  m.fee = 0; m.currency = "INR"; m.created = [];
  m.db.business.findUnique.mockImplementation(async () => ({ currency: m.currency }));
  m.db.paymentGateway.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => { m.created.push(data); return { id: "g1", ...data }; });
  m.db.paymentGateway.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "g1", ...data }));
});

const stripe = { provider: "STRIPE", mode: "TEST", keySecret: "rk_test_abcdefghijklmn", webhookSecret: "whsec_abc" };
const payu = { provider: "PAYU", mode: "TEST", keyId: "gtKFFx", keySecret: "salt" };
const paypal = { provider: "PAYPAL", mode: "TEST", keyId: "cid", keySecret: "sec", webhookSecret: "WH-1" };

describe("POST /api/settings/gateways: region and plan", () => {
  it("an Indian business cannot add Stripe or PayPal", async () => {
    for (const body of [stripe, paypal]) {
      const res = await post(body);
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe("GATEWAY_REGION");
    }
    expect(m.created).toHaveLength(0);
  });
  it("an international business cannot add an India-only gateway", async () => {
    m.currency = "USD";
    for (const body of [payu, { ...payu, provider: "RAZORPAY" }, { ...payu, provider: "CASHFREE" }, { ...payu, provider: "PHONEPE" }, { ...payu, provider: "CCAVENUE", extra: "AC" }, { ...payu, provider: "PAYTM", extra: "WEBSTAGING" }]) {
      const res = await post(body);
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe("GATEWAY_REGION");
    }
    expect(m.created).toHaveLength(0);
  });
  it("PayPal is refused for a currency it does not take (AED), Stripe is fine", async () => {
    m.currency = "AED";
    expect((await post(paypal)).status).toBe(403);
    expect((await post(stripe)).status).toBe(201);
  });
  it("India accepts PayU; international accepts Stripe and PayPal (USD)", async () => {
    expect((await post(payu)).status).toBe(201);
    m.currency = "USD";
    expect((await post(stripe)).status).toBe(201);
    expect((await post(paypal)).status).toBe(201);
    expect(m.created).toHaveLength(3);
  });
  it("plan gating: the entry plan (India Basic, International Free) cannot add any gateway", async () => {
    m.fee = 1000;
    expect((await post(payu)).status).toBe(403);
    m.currency = "USD";
    const res = await post(stripe);
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("UPGRADE_REQUIRED");
    expect(m.created).toHaveLength(0);
  });
  it("Stripe needs its signing secret, and a publishable key is refused", async () => {
    m.currency = "USD";
    expect((await post({ ...stripe, webhookSecret: undefined })).status).toBe(400);
    expect((await post({ ...stripe, keySecret: "pk_test_abcdefghijk" })).status).toBe(400);
    expect((await post({ ...stripe, webhookSecret: "notwhsec" })).status).toBe(400);
  });
  it("a provider with no key-id field stores a masked prefix of its secret, never the whole key", async () => {
    m.currency = "USD";
    await post(stripe);
    const stored = JSON.stringify(m.created[0]);
    expect(stored).not.toContain("rk_test_abcdefghijklmn");
  });
});
