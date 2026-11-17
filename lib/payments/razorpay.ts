import { createHmac, timingSafeEqual } from "node:crypto";
import {
  PaymentProviderError, type CreateOrderInput, type CreatedOrder, type OrderState, type PaymentEvent,
  type PaymentEventKind, type PaymentProvider, type RefundInput,
} from "./provider";

// A business's OWN Razorpay account (Payment Links API). Calvy never touches this money.
// Docs: https://razorpay.com/docs/api/payments/payment-links/
const BASE = "https://api.razorpay.com/v1";

export interface RazorpayConfig { keyId: string; keySecret: string; webhookSecret?: string | null }

/** Razorpay webhook signature: hex(HMAC-SHA256(rawBody, webhookSecret)). */
export function razorpaySignature(rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

/** Razorpay needs a link to live at least 15 minutes. */
const MIN_EXPIRY_MS = 16 * 60_000;

export function buildRazorpayLink(input: CreateOrderInput, now = Date.now()) {
  const expireBy = Math.floor(Math.max(input.expiresAt?.getTime() ?? 0, now + MIN_EXPIRY_MS) / 1000);
  return {
    amount: Math.round(input.amountMinor),
    currency: input.currency.toUpperCase(),
    reference_id: input.orderId,
    description: (input.note ?? "Booking").slice(0, 200),
    customer: { name: input.customer.name, email: input.customer.email, contact: input.customer.phone },
    notify: { sms: false, email: false },
    callback_url: input.returnUrl.replace("{order_id}", encodeURIComponent(input.orderId)),
    callback_method: "get",
    expire_by: expireBy,
  };
}

const EVENT_KIND: Record<string, PaymentEventKind> = {
  "payment_link.paid": "PAID",
  "payment.failed": "FAILED",
  "payment_link.expired": "OTHER",
  "payment_link.cancelled": "OTHER",
};

/** Verify and normalise a Razorpay webhook with the business's own webhook secret; null when the signature is wrong. */
export function parseRazorpayWebhook(rawBody: string, headers: Headers, secret: string): PaymentEvent | null {
  const given = headers.get("x-razorpay-signature");
  if (!given || !secret) return null;
  const expected = Buffer.from(razorpaySignature(rawBody, secret));
  const got = Buffer.from(given);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
  let body: {
    event?: string;
    payload?: {
      payment_link?: { entity?: { reference_id?: string; amount_paid?: number } };
      payment?: { entity?: { id?: string; method?: string; amount?: number } };
    };
  };
  try { body = JSON.parse(rawBody); } catch { return null; }
  const link = body.payload?.payment_link?.entity;
  const pay = body.payload?.payment?.entity;
  // payment.failed events do not carry our reference: they are acknowledged (unknown order) and the return page rechecks.
  const orderId = link?.reference_id ?? "";
  const type = body.event ?? "unknown";
  return {
    eventId: headers.get("x-razorpay-event-id") ?? `${type}:${pay?.id ?? (orderId || "none")}`,
    kind: EVENT_KIND[type] ?? "OTHER",
    providerOrderId: orderId,
    amountMinor: typeof link?.amount_paid === "number" ? link.amount_paid : typeof pay?.amount === "number" ? pay.amount : null,
    method: pay?.method ?? null,
    paymentRef: pay?.id ?? null,
  };
}

const LINK_STATE: Record<string, OrderState> = { created: "ACTIVE", partially_paid: "ACTIVE", paid: "PAID", expired: "EXPIRED", cancelled: "TERMINATED" };

export function createRazorpayProvider(config: RazorpayConfig, fetchImpl: typeof fetch = fetch): PaymentProvider {
  const auth = "Basic " + Buffer.from(`${config.keyId}:${config.keySecret}`).toString("base64");

  async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const res = await fetchImpl(`${BASE}${path}`, {
      method,
      headers: { Authorization: auth, "Content-Type": "application/json", Accept: "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: { description?: string } };
    // Never include request headers (credentials) in errors.
    if (!res.ok) throw new PaymentProviderError(`Razorpay ${method} ${path.split("/")[1]?.split("?")[0]} failed: ${data.error?.description ?? res.status}`, res.status);
    return data as T;
  }

  return {
    name: "RAZORPAY",

    async createOrder(input): Promise<CreatedOrder> {
      const r = await call<{ id: string; short_url: string; expire_by?: number }>("POST", "/payment_links", buildRazorpayLink(input));
      return { providerOrderId: input.orderId, gatewayRef: r.id, sessionId: r.short_url, redirect: true, expiresAt: r.expire_by ? new Date(r.expire_by * 1000) : null };
    },

    async getOrderState(_orderId, gatewayRef) {
      if (!gatewayRef) return "UNKNOWN";
      const r = await call<{ status?: string }>("GET", `/payment_links/${encodeURIComponent(gatewayRef)}`);
      return LINK_STATE[r.status ?? ""] ?? "UNKNOWN";
    },

    async refund(input: RefundInput) {
      if (!input.gatewayRef) throw new PaymentProviderError("Razorpay refund needs the payment link id");
      const link = await call<{ payments?: { payment_id?: string }[] }>("GET", `/payment_links/${encodeURIComponent(input.gatewayRef)}`);
      const paymentId = link.payments?.find((p) => p.payment_id)?.payment_id;
      if (!paymentId) throw new PaymentProviderError("Razorpay has no payment for this link");
      const r = await call<{ id: string }>("POST", `/payments/${encodeURIComponent(paymentId)}/refund`, {
        amount: Math.round(input.amountMinor), receipt: input.refundId.slice(0, 40), ...(input.note ? { notes: { reason: input.note.slice(0, 200) } } : {}),
      });
      return { refundRef: r.id };
    },

    verifyWebhook(rawBody, headers) {
      return config.webhookSecret ? parseRazorpayWebhook(rawBody, headers, config.webhookSecret) : null;
    },

    async verify() {
      try {
        await call("GET", "/payments?count=1");
        return { ok: true };
      } catch (e) {
        const status = e instanceof PaymentProviderError ? e.status : undefined;
        if (status === 401) return { ok: false, reason: "Razorpay rejected these keys. Check the Key ID and Key Secret, and that they are for the right mode (test or live)." };
        return { ok: false, reason: e instanceof Error ? e.message : "Could not reach Razorpay." };
      }
    },
  };
}
