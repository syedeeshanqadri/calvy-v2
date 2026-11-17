import { describe, it, expect, vi } from "vitest";
import { createSubsClient, parseSubsWebhook, subsSignature, toRupees, webhookSecrets } from "@/lib/subscriptions/cashfree";

const NOW = 1_800_000_000_000;
const ts = String(Math.floor(NOW / 1000));
const sign = (raw: string, secret = "sec", t = ts) => new Headers({ "x-webhook-signature": subsSignature(t, raw, secret), "x-webhook-timestamp": t });
const ev = (type: string, data: object) => JSON.stringify({ type, data, event_time: "2026-11-17T10:00:00+05:30" });
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });

describe("subscription webhook signature (HMAC-SHA256 base64 of timestamp + RAW body)", () => {
  const raw = ev("SUBSCRIPTION_PAYMENT_SUCCESS", { subscription_id: "calvy_sub_b1_x", payment_id: "calvy_ch_s1_20261201", payment_amount: 349, payment_status: "SUCCESS" });
  it("accepts a correct signature", () => {
    expect(parseSubsWebhook(raw, sign(raw), ["sec"], NOW)).toMatchObject({ kind: "PAYMENT_SUCCESS", subscriptionId: "calvy_sub_b1_x", paymentId: "calvy_ch_s1_20261201", amountMinor: 34900 });
  });
  it("rejects a wrong secret, an edited body, a missing header and an empty secret list", () => {
    expect(parseSubsWebhook(raw, sign(raw, "other"), ["sec"], NOW)).toBeNull();
    expect(parseSubsWebhook(raw + " ", sign(raw), ["sec"], NOW)).toBeNull();
    expect(parseSubsWebhook(raw, new Headers({ "x-webhook-timestamp": ts }), ["sec"], NOW)).toBeNull();
    expect(parseSubsWebhook(raw, sign(raw), [], NOW)).toBeNull();
  });
  it("accepts either candidate secret (client secret or a separate webhook secret)", () => {
    expect(parseSubsWebhook(raw, sign(raw, "webhook-secret"), ["sec", "webhook-secret"], NOW)).not.toBeNull();
  });
  it("rejects a replay older than 5 minutes (timestamp in seconds or milliseconds)", () => {
    const old = String(Math.floor((NOW - 6 * 60_000) / 1000));
    expect(parseSubsWebhook(raw, sign(raw, "sec", old), ["sec"], NOW)).toBeNull();
    expect(parseSubsWebhook(raw, sign(raw, "sec", String(NOW - 6 * 60_000)), ["sec"], NOW)).toBeNull();
    expect(parseSubsWebhook(raw, sign(raw, "sec", String(NOW)), ["sec"], NOW)).not.toBeNull();
  });
  it("the secrets come from the environment, never the repo", () => {
    expect(webhookSecrets({ CASHFREE_SECRET_KEY: "a", CASHFREE_SUBS_WEBHOOK_SECRET: "b" } as never)).toEqual(["a", "b"]);
    expect(webhookSecrets({} as never)).toEqual([]);
  });
});

describe("events are normalised", () => {
  const parse = (type: string, data: object) => parseSubsWebhook(ev(type, data), sign(ev(type, data)), ["sec"], NOW);
  it("authorisation success and failure", () => {
    expect(parse("SUBSCRIPTION_AUTH_STATUS", { subscription_id: "s", payment_id: "p", authorization_details: { authorization_status: "ACTIVE", payment_method: "upi" } })).toMatchObject({ kind: "AUTH_SUCCESS", method: "upi" });
    expect(parse("SUBSCRIPTION_AUTH_STATUS", { subscription_id: "s", authorization_details: { authorization_status: "FAILED" } })?.kind).toBe("AUTH_FAILED");
  });
  it("payment failed and cancelled both count as a failed charge", () => {
    expect(parse("SUBSCRIPTION_PAYMENT_FAILED", { subscription_id: "s", payment_id: "p" })?.kind).toBe("PAYMENT_FAILED");
    expect(parse("SUBSCRIPTION_PAYMENT_CANCELLED", { subscription_id: "s", payment_id: "p" })?.kind).toBe("PAYMENT_FAILED");
  });
  it("a mandate cancelled or expired ends the subscription; other status changes are ignored", () => {
    for (const status of ["CUSTOMER_CANCELLED", "CANCELLED", "EXPIRED", "LINK_EXPIRED", "COMPLETED"]) {
      expect(parse("SUBSCRIPTION_STATUS_CHANGED", { subscription_details: { subscription_id: "s", subscription_status: status } })?.kind, status).toBe("ENDED");
    }
    expect(parse("SUBSCRIPTION_STATUS_CHANGED", { subscription_details: { subscription_id: "s", subscription_status: "ACTIVE" } })?.kind).toBe("OTHER");
    expect(parse("SUBSCRIPTION_CARD_EXPIRY_REMINDER", { subscription_id: "s" })?.kind).toBe("OTHER");
  });
  it("a body without a subscription id is not an event", () => {
    expect(parse("SUBSCRIPTION_PAYMENT_SUCCESS", { payment_id: "p" })).toBeNull();
  });
  it("the same payment event always has the same id (idempotency key)", () => {
    const a = parse("SUBSCRIPTION_PAYMENT_SUCCESS", { subscription_id: "s", payment_id: "p", payment_status: "SUCCESS" });
    const b = parse("SUBSCRIPTION_PAYMENT_SUCCESS", { subscription_id: "s", payment_id: "p", payment_status: "SUCCESS", extra: 1 });
    expect(a?.eventId).toBe(b?.eventId);
  });
});

describe("subscription API calls", () => {
  const cfg = { appId: "app-id-123", secretKey: "secret-456", env: "sandbox" as const };
  it("creates an ON_DEMAND subscription with rupee amounts, the authorisation kept (not refunded) and the chosen methods", async () => {
    const f = vi.fn(async () => json({ subscription_id: "calvy_sub_1", cf_subscription_id: 77, subscription_session_id: "sess_x", subscription_status: "INITIALIZED" }));
    const c = createSubsClient(cfg, f as unknown as typeof fetch);
    const r = await c.createSubscription({ subscriptionId: "calvy_sub_1", customer: { email: "o@x.com", phone: "9999999999", name: "Owner" }, planName: "Calvy Pro monthly", maxAmountMinor: 34900, authorizationAmountMinor: 17450, methods: ["upi", "card"], returnUrl: "https://calvy.io/dashboard/billing?subscription_id=calvy_sub_1", expiresAt: new Date("2026-11-18T00:00:00Z") });
    expect(r).toEqual({ subscriptionId: "calvy_sub_1", cfSubscriptionId: "77", sessionId: "sess_x", status: "INITIALIZED" });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://sandbox.cashfree.com/pg/subscriptions");
    expect(init.headers).toMatchObject({ "x-client-id": "app-id-123", "x-client-secret": "secret-456", "x-api-version": "2026-01-01" });
    const body = JSON.parse(String(init.body));
    expect(body.plan_details).toMatchObject({ plan_type: "ON_DEMAND", plan_currency: "INR", plan_max_amount: 349 });
    expect(body.authorization_details).toEqual({ authorization_amount: 174.5, authorization_amount_refund: false, payment_methods: ["upi", "card"] });
    expect(body.customer_details).toMatchObject({ customer_email: "o@x.com", customer_phone: "9999999999" });
  });
  it("an e-mandate authorises for 0", async () => {
    const f = vi.fn(async () => json({ subscription_id: "s", subscription_session_id: "x" }));
    await createSubsClient(cfg, f as unknown as typeof fetch).createSubscription({ subscriptionId: "s", customer: { email: "o@x.com", phone: "9999999999", name: "O" }, planName: "p", maxAmountMinor: 34900, authorizationAmountMinor: 0, methods: ["enach"], returnUrl: "https://x", expiresAt: new Date() });
    expect(JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body)).authorization_details).toMatchObject({ authorization_amount: 0, payment_methods: ["enach"] });
  });
  it("raises a charge with our payment id and the amount in rupees; cancels with the manage action", async () => {
    const f = vi.fn(async () => json({ payment_id: "calvy_ch_1", payment_status: "INITIALIZED" }));
    const c = createSubsClient(cfg, f as unknown as typeof fetch);
    expect(await c.charge({ subscriptionId: "s", paymentId: "calvy_ch_1", amountMinor: 62450, scheduleDate: new Date("2026-12-01T00:00:00Z") })).toEqual({ paymentId: "calvy_ch_1", status: "INITIALIZED" });
    expect(JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toMatchObject({ subscription_id: "s", payment_type: "CHARGE", payment_amount: 624.5, payment_id: "calvy_ch_1" });
    await c.cancel("s");
    expect(String((f.mock.calls[1] as unknown as [string])[0])).toBe("https://sandbox.cashfree.com/pg/subscriptions/s/manage");
    expect(JSON.parse(String((f.mock.calls[1] as unknown as [string, RequestInit])[1].body))).toEqual({ subscription_id: "s", action: "CANCEL" });
  });
  it("errors never include the credentials", async () => {
    const c = createSubsClient(cfg, (async () => json({ message: "authentication Failed" }, 401)) as unknown as typeof fetch);
    const e = await c.getSubscription("s").catch((x: Error) => x);
    expect((e as Error).message).toContain("authentication Failed");
    expect((e as Error).message).not.toMatch(/app-id-123|secret-456/);
    expect(toRupees(34900)).toBe(349);
  });
});
