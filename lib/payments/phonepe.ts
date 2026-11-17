import { createHash, timingSafeEqual } from "node:crypto";
import {
  PaymentProviderError, type CreateOrderInput, type CreatedOrder, type OrderState, type PaymentEvent,
  type PaymentProvider, type RefundInput,
} from "./provider";

// A business's OWN PhonePe Payment Gateway account (Standard Checkout v2). Calvy never touches this money.
// Docs: https://developer.phonepe.com/payment-gateway
const URLS = {
  TEST: { auth: "https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token", pg: "https://api-preprod.phonepe.com/apis/pg-sandbox" },
  LIVE: { auth: "https://api.phonepe.com/apis/identity-manager/v1/oauth/token", pg: "https://api.phonepe.com/apis/pg" },
} as const;

export interface PhonePeConfig {
  clientId: string;
  clientSecret: string;
  clientVersion: string;
  mode: "TEST" | "LIVE";
  /** The username and password the business set for the PhonePe webhook ("username:password"). */
  webhookCredentials?: string | null;
}

/** PhonePe webhook Authorization header: hex(SHA256("username:password")). */
export const phonepeWebhookHash = (credentials: string) => createHash("sha256").update(credentials).digest("hex");

export function parsePhonePeWebhook(rawBody: string, headers: Headers, credentials: string): PaymentEvent | null {
  // PhonePe sends the hash, optionally prefixed with "SHA256 ".
  const given = (headers.get("authorization") ?? "").replace(/^SHA256\s+/i, "").trim().toLowerCase();
  if (!given || !credentials) return null;
  const expected = Buffer.from(phonepeWebhookHash(credentials));
  const got = Buffer.from(given);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
  let body: { event?: string; payload?: { merchantOrderId?: string; orderId?: string; state?: string; amount?: number; paymentDetails?: { transactionId?: string; paymentMode?: string }[] } };
  try { body = JSON.parse(rawBody); } catch { return null; }
  const p = body.payload;
  const detail = p?.paymentDetails?.[0];
  const state = p?.state ?? "";
  return {
    eventId: `${body.event ?? "unknown"}:${detail?.transactionId ?? p?.orderId ?? p?.merchantOrderId ?? "none"}`,
    kind: state === "COMPLETED" ? "PAID" : state === "FAILED" ? "FAILED" : "OTHER",
    providerOrderId: p?.merchantOrderId ?? "",
    amountMinor: typeof p?.amount === "number" ? p.amount : null,
    method: detail?.paymentMode ?? null,
    paymentRef: detail?.transactionId ?? null,
  };
}

const STATE: Record<string, OrderState> = { PENDING: "ACTIVE", COMPLETED: "PAID", FAILED: "TERMINATED" };

export function createPhonePeProvider(config: PhonePeConfig, fetchImpl: typeof fetch = fetch): PaymentProvider {
  const urls = URLS[config.mode];
  let token: { value: string; expiresAt: number } | null = null;

  async function accessToken(): Promise<string> {
    if (token && token.expiresAt > Date.now() + 30_000) return token.value;
    const res = await fetchImpl(urls.auth, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: config.clientId, client_version: config.clientVersion, client_secret: config.clientSecret, grant_type: "client_credentials" }).toString(),
    });
    const data = (await res.json().catch(() => ({}))) as { access_token?: string; expires_at?: number; message?: string };
    if (!res.ok || !data.access_token) throw new PaymentProviderError(`PhonePe sign-in failed: ${data.message ?? res.status}`, res.status);
    token = { value: data.access_token, expiresAt: (data.expires_at ?? Date.now() / 1000 + 600) * 1000 };
    return token.value;
  }

  async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const res = await fetchImpl(`${urls.pg}${path}`, {
      method,
      headers: { Authorization: `O-Bearer ${await accessToken()}`, "Content-Type": "application/json", Accept: "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as { message?: string; code?: string };
    if (!res.ok) throw new PaymentProviderError(`PhonePe ${method} ${path.split("/")[2] ?? ""} failed: ${data.message ?? data.code ?? res.status}`, res.status);
    return data as T;
  }

  return {
    name: "PHONEPE",

    async createOrder(input: CreateOrderInput): Promise<CreatedOrder> {
      const seconds = input.expiresAt ? Math.floor((input.expiresAt.getTime() - Date.now()) / 1000) : 900;
      const r = await call<{ orderId: string; redirectUrl: string; expireAt?: number }>("POST", "/checkout/v2/pay", {
        merchantOrderId: input.orderId,
        amount: Math.round(input.amountMinor),
        expireAfter: Math.min(3600, Math.max(300, seconds)),
        paymentFlow: { type: "PG_CHECKOUT", message: (input.note ?? "Booking").slice(0, 100), merchantUrls: { redirectUrl: input.returnUrl.replace("{order_id}", encodeURIComponent(input.orderId)) } },
      });
      return { providerOrderId: input.orderId, gatewayRef: r.orderId, sessionId: r.redirectUrl, redirect: true, expiresAt: r.expireAt ? new Date(r.expireAt) : null };
    },

    async getOrderState(orderId) {
      const r = await call<{ state?: string }>("GET", `/checkout/v2/order/${encodeURIComponent(orderId)}/status`);
      return STATE[r.state ?? ""] ?? "UNKNOWN";
    },

    async refund(input: RefundInput) {
      const r = await call<{ refundId?: string }>("POST", "/payments/v2/refund", {
        merchantRefundId: input.refundId, originalMerchantOrderId: input.providerOrderId, amount: Math.round(input.amountMinor),
      });
      return { refundRef: r.refundId ?? input.refundId };
    },

    verifyWebhook(rawBody, headers) {
      return config.webhookCredentials ? parsePhonePeWebhook(rawBody, headers, config.webhookCredentials) : null;
    },

    async verify() {
      try {
        await accessToken();
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: e instanceof PaymentProviderError && e.status && e.status < 500 ? "PhonePe rejected these credentials. Check the Client ID, Client Secret and Client Version, and the mode (test or live)." : e instanceof PaymentProviderError ? e.message : "Could not reach PhonePe. Try again in a moment." };
      }
    },
  };
}
