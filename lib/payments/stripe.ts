import { createHmac, timingSafeEqual } from "node:crypto";
import {
  PaymentProviderError, type CreateOrderInput, type CreatedOrder, type OrderState, type PaymentEvent,
  type PaymentEventKind, type PaymentProvider, type RefundInput,
} from "./provider";

// A business's OWN Stripe account (Checkout Session, hosted page). No Stripe Connect: Calvy never touches this money.
// The owner pastes a restricted secret key (rk_...) and the webhook signing secret (whsec_...).
// Docs: https://docs.stripe.com/api/checkout/sessions
const BASE = "https://api.stripe.com/v1";

export interface StripeConfig { secretKey: string; webhookSecret?: string | null }

/** Stripe wants a Checkout Session to live at least 30 minutes. */
const MIN_EXPIRY_MS = 31 * 60_000;
/** How old a signed webhook may be (Stripe's own default). */
export const STRIPE_TOLERANCE_S = 300;

/** Stripe-Signature: "t=<unix>,v1=<hex>"; v1 = hex(HMAC-SHA256(`${t}.${rawBody}`, whsec)). */
export function stripeSignature(rawBody: string, secret: string, timestamp: number): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

/** Form-encode nested params the way Stripe expects: a[b][0][c]=1. */
export function stripeForm(params: Record<string, unknown>): string {
  const out: string[] = [];
  const add = (key: string, v: unknown) => {
    if (v === undefined || v === null) return;
    if (Array.isArray(v)) v.forEach((x, i) => add(`${key}[${i}]`, x));
    else if (typeof v === "object") for (const [k, x] of Object.entries(v)) add(`${key}[${k}]`, x);
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  };
  for (const [k, v] of Object.entries(params)) add(k, v);
  return out.join("&");
}

export function buildStripeSession(input: CreateOrderInput, now = Date.now()) {
  const returnUrl = input.returnUrl.replace("{order_id}", encodeURIComponent(input.orderId));
  const expires = Math.floor(Math.max(input.expiresAt?.getTime() ?? 0, now + MIN_EXPIRY_MS) / 1000);
  return {
    mode: "payment",
    client_reference_id: input.orderId,
    customer_email: input.customer.email || undefined,
    success_url: returnUrl,
    cancel_url: returnUrl,
    expires_at: expires,
    line_items: [{
      quantity: 1,
      // The amount is in the currency's own smallest unit (JPY whole yen, USD cents): lib/currency.toMinorUnits.
      price_data: { currency: input.currency.toLowerCase(), unit_amount: Math.round(input.amountMinor), product_data: { name: (input.note ?? "Booking").slice(0, 120) } },
    }],
    metadata: { orderId: input.orderId, ...(input.tags ?? {}) },
    payment_intent_data: { metadata: { orderId: input.orderId } },
  };
}

const EVENT_KIND: Record<string, PaymentEventKind> = {
  "checkout.session.completed": "PAID",
  "checkout.session.async_payment_succeeded": "PAID",
  "checkout.session.async_payment_failed": "FAILED",
  "checkout.session.expired": "OTHER",
};

/** Verify and normalise a Stripe webhook with the business's own signing secret; null when missing, wrong or too old. */
export function parseStripeWebhook(rawBody: string, headers: Headers, secret: string, nowMs = Date.now()): PaymentEvent | null {
  const header = headers.get("stripe-signature");
  if (!header || !secret) return null;
  const parts = header.split(",").map((p) => p.trim().split("="));
  const t = Number(parts.find(([k]) => k === "t")?.[1]);
  const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v ?? "");
  if (!Number.isFinite(t) || sigs.length === 0) return null;
  if (Math.abs(nowMs / 1000 - t) > STRIPE_TOLERANCE_S) return null;
  const expected = Buffer.from(stripeSignature(rawBody, secret, t));
  const ok = sigs.some((s) => { const b = Buffer.from(s); return b.length === expected.length && timingSafeEqual(b, expected); });
  if (!ok) return null;
  let body: { id?: string; type?: string; data?: { object?: { id?: string; client_reference_id?: string | null; amount_total?: number | null; payment_status?: string; payment_intent?: string | null } } };
  try { body = JSON.parse(rawBody); } catch { return null; }
  const o = body.data?.object;
  let kind = EVENT_KIND[body.type ?? ""] ?? "OTHER";
  // "completed" also fires for a delayed payment method that has not paid yet: only a paid session is PAID.
  if (body.type === "checkout.session.completed" && o?.payment_status !== "paid") kind = "OTHER";
  return {
    eventId: body.id ?? `${body.type}:${o?.id ?? "none"}`,
    kind,
    providerOrderId: o?.client_reference_id ?? "",
    amountMinor: typeof o?.amount_total === "number" ? o.amount_total : null,
    method: "card",
    paymentRef: o?.payment_intent ?? o?.id ?? null,
  };
}

export function createStripeProvider(config: StripeConfig, fetchImpl: typeof fetch = fetch): PaymentProvider {
  async function call<T>(method: "GET" | "POST", path: string, body?: string, idempotencyKey?: string): Promise<T> {
    const res = await fetchImpl(`${BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${config.secretKey}`, Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body,
    });
    const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    // Never include request headers (credentials) in errors.
    if (!res.ok) throw new PaymentProviderError(`Stripe ${method} ${path.split("/")[2]?.split("?")[0]} failed: ${data.error?.message ?? res.status}`, res.status);
    return data as T;
  }

  return {
    name: "STRIPE",

    async createOrder(input): Promise<CreatedOrder> {
      const r = await call<{ id: string; url: string; expires_at?: number }>("POST", "/checkout/sessions", stripeForm(buildStripeSession(input)), `create-${input.orderId}`);
      return { providerOrderId: input.orderId, gatewayRef: r.id, sessionId: r.url, redirect: true, expiresAt: r.expires_at ? new Date(r.expires_at * 1000) : null };
    },

    async getOrderState(_orderId, gatewayRef) {
      if (!gatewayRef) return "UNKNOWN";
      const r = await call<{ status?: string; payment_status?: string }>("GET", `/checkout/sessions/${encodeURIComponent(gatewayRef)}`);
      if (r.status === "complete") return r.payment_status === "paid" || r.payment_status === "no_payment_required" ? "PAID" : "ACTIVE";
      if (r.status === "expired") return "EXPIRED";
      return r.status === "open" ? "ACTIVE" : "UNKNOWN";
    },

    async refund(input: RefundInput) {
      if (!input.gatewayRef) throw new PaymentProviderError("Stripe refund needs the checkout session id");
      const s = await call<{ payment_intent?: string | null }>("GET", `/checkout/sessions/${encodeURIComponent(input.gatewayRef)}`);
      if (!s.payment_intent) throw new PaymentProviderError("Stripe has no payment for this session");
      const r = await call<{ id: string }>("POST", "/refunds", stripeForm({ payment_intent: s.payment_intent, amount: Math.round(input.amountMinor), metadata: { refundId: input.refundId } }), `refund-${input.refundId}`);
      return { refundRef: r.id };
    },

    verifyWebhook(rawBody, headers) {
      return config.webhookSecret ? parseStripeWebhook(rawBody, headers, config.webhookSecret) : null;
    },

    async verify() {
      try {
        await call("GET", "/checkout/sessions?limit=1");
        return { ok: true };
      } catch (e) {
        const status = e instanceof PaymentProviderError ? e.status : undefined;
        if (status === 401) return { ok: false, reason: "Stripe rejected this key. Paste the secret or restricted key (sk_… or rk_…) from the right mode, test or live." };
        if (status === 403) return { ok: false, reason: "This restricted key is missing a permission. It needs Checkout Sessions (write) and Refunds (write)." };
        return { ok: false, reason: e instanceof PaymentProviderError ? e.message : "Could not reach Stripe. Try again in a moment." };
      }
    },
  };
}
