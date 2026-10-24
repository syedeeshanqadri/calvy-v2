import { createHmac, timingSafeEqual } from "node:crypto";
import {
  PaymentProviderError, type CreateOrderInput, type CreatedOrder, type OrderState, type PaymentEvent,
  type PaymentEventKind, type PaymentProvider, type RefundInput,
} from "./provider";

// Cashfree Payment Gateway, API version 2023-08-01.
// Docs: https://www.cashfree.com/docs/api-reference/payments/latest/orders/create
const API_VERSION = "2023-08-01";
const BASE_URL = { sandbox: "https://sandbox.cashfree.com/pg", production: "https://api.cashfree.com/pg" } as const;

export interface CashfreeConfig {
  appId: string;
  secretKey: string;
  env: "sandbox" | "production";
}

/** Minor units -> Cashfree amount (rupees, 2 decimals). */
export const toGatewayAmount = (minor: number) => Math.round(minor) / 100;

/** The order body Cashfree receives (exported for tests). */
export function buildOrderBody(input: CreateOrderInput) {
  return {
    order_id: input.orderId,
    order_amount: toGatewayAmount(input.amountMinor),
    order_currency: input.currency.toUpperCase(),
    customer_details: {
      customer_id: input.customer.id,
      customer_name: input.customer.name,
      customer_email: input.customer.email,
      customer_phone: input.customer.phone,
    },
    order_meta: {
      return_url: input.returnUrl,
      ...(input.notifyUrl ? { notify_url: input.notifyUrl } : {}),
    },
    ...(input.expiresAt ? { order_expiry_time: input.expiresAt.toISOString() } : {}),
    ...(input.note ? { order_note: input.note.slice(0, 200) } : {}),
    ...(input.tags ? { order_tags: input.tags } : {}),
  };
}

/** Cashfree webhook signature: base64(HMAC-SHA256(timestamp + rawBody, secretKey)). */
export function cashfreeSignature(timestamp: string, rawBody: string, secretKey: string): string {
  return createHmac("sha256", secretKey).update(timestamp + rawBody).digest("base64");
}

const EVENT_KIND: Record<string, PaymentEventKind> = {
  PAYMENT_SUCCESS_WEBHOOK: "PAID",
  PAYMENT_FAILED_WEBHOOK: "FAILED",
  PAYMENT_USER_DROPPED_WEBHOOK: "DROPPED",
};

/** Verify and normalise a Cashfree payment webhook; null when the signature does not match. */
export function parseCashfreeWebhook(rawBody: string, headers: Headers, secretKey: string): PaymentEvent | null {
  const signature = headers.get("x-webhook-signature");
  const timestamp = headers.get("x-webhook-timestamp");
  if (!signature || !timestamp) return null;
  const expected = Buffer.from(cashfreeSignature(timestamp, rawBody, secretKey));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

  let body: {
    type?: string;
    data?: {
      order?: { order_id?: string };
      payment?: { cf_payment_id?: string | number; payment_amount?: number; payment_group?: string };
    };
  };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return null;
  }
  const orderId = body.data?.order?.order_id;
  if (!orderId) return null;
  const type = body.type ?? "UNKNOWN";
  const payment = body.data?.payment;
  const paymentRef = payment?.cf_payment_id != null ? String(payment.cf_payment_id) : null;
  return {
    // Retries resend the same payment + type, so this pair identifies the event.
    eventId: `${type}:${paymentRef ?? orderId}`,
    kind: EVENT_KIND[type] ?? "OTHER",
    providerOrderId: orderId,
    amountMinor: typeof payment?.payment_amount === "number" ? Math.round(payment.payment_amount * 100) : null,
    method: payment?.payment_group ?? null,
    paymentRef,
  };
}

const ORDER_STATES: Record<string, OrderState> = { ACTIVE: "ACTIVE", PAID: "PAID", EXPIRED: "EXPIRED", TERMINATED: "TERMINATED" };

export function createCashfreeProvider(config: CashfreeConfig, fetchImpl: typeof fetch = fetch): PaymentProvider {
  const base = BASE_URL[config.env];

  async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const res = await fetchImpl(`${base}${path}`, {
      method,
      headers: {
        "x-client-id": config.appId,
        "x-client-secret": config.secretKey,
        "x-api-version": API_VERSION,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    // Never include request headers (credentials) in errors.
    if (!res.ok) throw new PaymentProviderError(`Cashfree ${method} ${path.split("/")[1]} failed: ${data.message ?? res.status}`, res.status);
    return data as T;
  }

  return {
    name: "CASHFREE",

    async createOrder(input): Promise<CreatedOrder> {
      const r = await call<{ order_id: string; payment_session_id: string; order_expiry_time?: string }>("POST", "/orders", buildOrderBody(input));
      return {
        providerOrderId: r.order_id,
        sessionId: r.payment_session_id,
        expiresAt: r.order_expiry_time ? new Date(r.order_expiry_time) : null,
      };
    },

    async getOrderState(providerOrderId) {
      const r = await call<{ order_status?: string }>("GET", `/orders/${encodeURIComponent(providerOrderId)}`);
      return ORDER_STATES[r.order_status ?? ""] ?? "UNKNOWN";
    },

    async refund(input: RefundInput) {
      const r = await call<{ cf_refund_id?: string | number; refund_id: string }>(
        "POST",
        `/orders/${encodeURIComponent(input.providerOrderId)}/refunds`,
        { refund_amount: toGatewayAmount(input.amountMinor), refund_id: input.refundId, ...(input.note ? { refund_note: input.note.slice(0, 100) } : {}) },
      );
      return { refundRef: String(r.cf_refund_id ?? r.refund_id) };
    },

    verifyWebhook(rawBody, headers) {
      return parseCashfreeWebhook(rawBody, headers, config.secretKey);
    },
  };
}
