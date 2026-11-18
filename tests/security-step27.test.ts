import { describe, it, expect } from "vitest";
import { csrfBlocked, ipBucket, accountBucket, isWebhookPath } from "@/lib/apiGuard";
import { createRateLimiter, rateLimitStatus, upstashConfig, rateLimitFailClosed } from "@/lib/ratelimit";
import { isKnownPushHost } from "@/lib/push";
import { cashfreeSignature, parseCashfreeWebhook } from "@/lib/payments/cashfree";
import { featureForApiPath } from "@/lib/flags";

const base = { method: "POST", pathname: "/api/services", origin: null as string | null, secFetchSite: null as string | null, host: "calvy.io", rootDomain: "calvy.io" };

describe("S27 CSRF origin check", () => {
  it("allows same-origin, tenant subdomains and non-browser clients", () => {
    expect(csrfBlocked({ ...base, origin: "https://calvy.io" })).toBe(false);
    expect(csrfBlocked({ ...base, origin: "https://glow.calvy.io" })).toBe(false);
    expect(csrfBlocked({ ...base, origin: "http://localhost:3000", host: "localhost:3000" })).toBe(false);
    expect(csrfBlocked({ ...base })).toBe(false);
    expect(csrfBlocked({ ...base, secFetchSite: "same-origin" })).toBe(false);
  });
  it("blocks cross-site browser writes", () => {
    expect(csrfBlocked({ ...base, origin: "https://evil.example" })).toBe(true);
    expect(csrfBlocked({ ...base, origin: "https://calvy.io.evil.example" })).toBe(true);
    expect(csrfBlocked({ ...base, origin: "null" })).toBe(true);
    expect(csrfBlocked({ ...base, secFetchSite: "cross-site" })).toBe(true);
  });
  it("never blocks reads, webhooks, cron or NextAuth", () => {
    expect(csrfBlocked({ ...base, method: "GET", origin: "https://evil.example" })).toBe(false);
    for (const p of ["/api/payments/webhook/abc", "/api/payments/cashfree/webhook", "/api/whatsapp/webhook", "/api/cron/notifications", "/api/auth/callback/credentials"]) {
      expect(csrfBlocked({ ...base, pathname: p, origin: "https://evil.example" })).toBe(false);
    }
  });
  it("buckets are keyed per IP and per account", () => {
    expect(ipBucket("/api/x", "1.1.1.1").key).toBe("api-ip:1.1.1.1");
    expect(ipBucket("/api/payments/webhook/k", "1.1.1.1").key).toBe("api-webhook:1.1.1.1");
    expect(accountBucket("u1").key).toBe("api-acct:u1");
    expect(isWebhookPath("/api/subscriptions/webhook")).toBe(true);
  });
});

describe("S27 rate limiter config", () => {
  it("reads either Upstash name pair", () => {
    expect(upstashConfig({ UPSTASH_REDIS_REST_URL: "u", UPSTASH_REDIS_REST_TOKEN: "t" })).toEqual({ url: "u", token: "t" });
    expect(upstashConfig({ KV_REST_API_URL: "k", KV_REST_API_TOKEN: "kt" })).toEqual({ url: "k", token: "kt" });
    expect(upstashConfig({ KV_REST_API_URL: "k" })).toBeNull();
  });
  it("health warning without Upstash; fail-closed flag parsing", () => {
    expect(rateLimitStatus({}).warning).toMatch(/per-instance/);
    expect(rateLimitStatus({ RATE_LIMIT_FAIL_CLOSED: "1" }).warning).toMatch(/refuse/);
    expect(rateLimitStatus({ KV_REST_API_URL: "k", KV_REST_API_TOKEN: "t" }).warning).toBeNull();
    expect(rateLimitFailClosed({})).toBe(false);
    expect(rateLimitFailClosed({ RATE_LIMIT_FAIL_CLOSED: "true" })).toBe(true);
  });
  it("fails closed without Redis only when asked; memory fallback otherwise", async () => {
    const open = createRateLimiter({ failClosed: () => false });
    expect((await open("k", 1, 1000)).ok).toBe(true);
    const closed = createRateLimiter({ failClosed: () => true });
    expect((await closed("k", 100, 1000)).ok).toBe(false);
  });
});

describe("S27 push hosts, payment freshness, flag paths", () => {
  it("accepts only real browser push services over https", () => {
    expect(isKnownPushHost("https://fcm.googleapis.com/fcm/send/x")).toBe(true);
    expect(isKnownPushHost("https://updates.push.services.mozilla.com/wpush/v2/x")).toBe(true);
    expect(isKnownPushHost("https://web.push.apple.com/x")).toBe(true);
    expect(isKnownPushHost("http://fcm.googleapis.com/x")).toBe(false);
    expect(isKnownPushHost("https://169.254.169.254/x")).toBe(false);
    expect(isKnownPushHost("https://fcm.googleapis.com.evil.example/x")).toBe(false);
  });
  it("cashfree webhook: stale or non-numeric timestamps are refused even when correctly signed", () => {
    const secret = "s3cret";
    const body = JSON.stringify({ type: "PAYMENT_SUCCESS_WEBHOOK", data: { order: { order_id: "calvy_a" }, payment: { cf_payment_id: 1, payment_amount: 10 } } });
    const mk = (ts: string) => new Headers({ "x-webhook-timestamp": ts, "x-webhook-signature": cashfreeSignature(ts, body, secret) });
    const now = 1_800_000_000_000;
    expect(parseCashfreeWebhook(body, mk(String(now)), secret, now)).not.toBeNull();
    expect(parseCashfreeWebhook(body, mk(String(now - 11 * 60_000)), secret, now)).toBeNull();
    expect(parseCashfreeWebhook(body, mk("abc"), secret, now)).toBeNull();
  });
  it("flag guard path normalisation covers encoded and dotted paths", () => {
    expect(featureForApiPath("/api/broadcasts/send")).toBe("broadcasts");
    expect(featureForApiPath("/api/%62roadcasts/send")).toBe("broadcasts");
    expect(featureForApiPath("/api/x/../broadcasts/send")).toBe("broadcasts");
  });
});
