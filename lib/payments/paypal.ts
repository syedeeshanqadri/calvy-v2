import {
  PaymentProviderError, type CreateOrderInput, type CreatedOrder, type OrderState, type PaymentEvent,
  type PaymentEventKind, type PaymentProvider, type RefundInput,
} from "./provider";
import { toDecimalString, toMinorUnits } from "@/lib/currency";
import { PAYPAL_CURRENCIES } from "./paypalCurrencies";

// A business's OWN PayPal account (Orders API v2, hosted approval page). Calvy never touches this money.
// Flow: create order (intent CAPTURE) -> customer approves on paypal.com -> we capture (on the approval webhook, or when the
// customer returns) -> capture webhook = paid. Docs: https://developer.paypal.com/docs/api/orders/v2/
export const PAYPAL_BASE = { LIVE: "https://api-m.paypal.com", TEST: "https://api-m.sandbox.paypal.com" } as const;

export { PAYPAL_CURRENCIES };
export const paypalSupportsCurrency = (c: string | null | undefined) => (PAYPAL_CURRENCIES as readonly string[]).includes((c ?? "").toUpperCase());

export interface PayPalConfig { clientId: string; clientSecret: string; mode: "TEST" | "LIVE"; /** The webhook's ID from the PayPal dashboard (not a secret): needed to verify its events. */ webhookId?: string | null }

export function buildPayPalOrder(input: CreateOrderInput) {
  const returnUrl = input.returnUrl.replace("{order_id}", encodeURIComponent(input.orderId));
  return {
    intent: "CAPTURE",
    purchase_units: [{
      reference_id: input.orderId.slice(0, 256),
      custom_id: input.orderId.slice(0, 127),
      description: (input.note ?? "Booking").slice(0, 127),
      // Decimal string in the currency's own decimals (JPY has none): lib/currency.
      amount: { currency_code: input.currency.toUpperCase(), value: toDecimalString(input.amountMinor, input.currency) },
    }],
    payment_source: {
      paypal: {
        email_address: input.customer.email || undefined,
        experience_context: { user_action: "PAY_NOW", shipping_preference: "NO_SHIPPING", return_url: returnUrl, cancel_url: returnUrl },
      },
    },
  };
}

const ORDER_STATE: Record<string, OrderState> = { CREATED: "ACTIVE", PAYER_ACTION_REQUIRED: "ACTIVE", APPROVED: "ACTIVE", SAVED: "ACTIVE", COMPLETED: "PAID", VOIDED: "TERMINATED" };

interface Money { value?: string; currency_code?: string }
const toMinor = (m: Money | undefined, currency: string | undefined): number | null => {
  if (!m?.value) return null;
  const n = Number(m.value);
  return Number.isFinite(n) ? toMinorUnits(n, currency ?? m.currency_code) : null;
};

interface Capture { id?: string; status?: string; amount?: Money; custom_id?: string }

const WEBHOOK_KIND: Record<string, PaymentEventKind> = { "PAYMENT.CAPTURE.COMPLETED": "PAID", "PAYMENT.CAPTURE.DENIED": "FAILED", "CHECKOUT.PAYMENT-APPROVAL.REVERSED": "OTHER" };

export function createPayPalProvider(config: PayPalConfig, fetchImpl: typeof fetch = fetch): PaymentProvider {
  const base = PAYPAL_BASE[config.mode];
  let token: { value: string; expiresAt: number } | null = null;

  async function accessToken(): Promise<string> {
    if (token && token.expiresAt > Date.now() + 30_000) return token.value;
    const res = await fetchImpl(`${base}/v1/oauth2/token`, {
      method: "POST",
      headers: { Authorization: "Basic " + Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: "grant_type=client_credentials",
    });
    const data = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string };
    if (!res.ok || !data.access_token) throw new PaymentProviderError(`PayPal sign-in failed: ${data.error_description ?? res.status}`, res.status);
    token = { value: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 300) * 1000 };
    return token.value;
  }

  async function call<T>(method: "GET" | "POST", path: string, body?: unknown, requestId?: string): Promise<T> {
    const res = await fetchImpl(`${base}${path}`, {
      method,
      headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json", Accept: "application/json", ...(requestId ? { "PayPal-Request-Id": requestId } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as { message?: string; name?: string };
    if (!res.ok) throw new PaymentProviderError(`PayPal ${method} ${path.split("/")[3]} failed: ${data.message ?? data.name ?? res.status}`, res.status);
    return data as T;
  }

  /** Capture an approved order. Safe to repeat: the request id makes PayPal return the same capture. */
  async function capture(orderId: string, ourOrderId: string) {
    return call<{ status?: string; purchase_units?: { payments?: { captures?: Capture[] } }[] }>("POST", `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {}, `capture-${ourOrderId}`);
  }

  return {
    name: "PAYPAL",

    async createOrder(input): Promise<CreatedOrder> {
      const r = await call<{ id: string; links?: { rel?: string; href?: string }[] }>("POST", "/v2/checkout/orders", buildPayPalOrder(input), `create-${input.orderId}`);
      const approve = r.links?.find((l) => l.rel === "payer-action" || l.rel === "approve")?.href;
      if (!approve) throw new PaymentProviderError("PayPal did not return an approval link");
      return { providerOrderId: input.orderId, gatewayRef: r.id, sessionId: approve, redirect: true, expiresAt: null };
    },

    // The customer's return page asks this: an approved order is captured here, so a late or missing webhook cannot strand a payment.
    async getOrderState(orderId, gatewayRef) {
      if (!gatewayRef) return "UNKNOWN";
      const r = await call<{ status?: string }>("GET", `/v2/checkout/orders/${encodeURIComponent(gatewayRef)}`);
      if (r.status === "APPROVED") {
        const c = await capture(gatewayRef, orderId);
        return c.status === "COMPLETED" ? "PAID" : "ACTIVE";
      }
      return ORDER_STATE[r.status ?? ""] ?? "UNKNOWN";
    },

    async refund(input: RefundInput) {
      if (!input.gatewayRef) throw new PaymentProviderError("PayPal refund needs the order id");
      const o = await call<{ purchase_units?: { amount?: Money; payments?: { captures?: Capture[] } }[] }>("GET", `/v2/checkout/orders/${encodeURIComponent(input.gatewayRef)}`);
      const cap = o.purchase_units?.[0]?.payments?.captures?.find((c) => c.id);
      if (!cap?.id) throw new PaymentProviderError("PayPal has no captured payment for this order");
      const currency = cap.amount?.currency_code ?? "USD";
      const r = await call<{ id: string }>("POST", `/v2/payments/captures/${encodeURIComponent(cap.id)}/refund`, { amount: { value: toDecimalString(input.amountMinor, currency), currency_code: currency }, note_to_payer: (input.note ?? "").slice(0, 255) || undefined, invoice_id: input.refundId.slice(0, 127) }, `refund-${input.refundId}`);
      return { refundRef: r.id };
    },

    // PayPal events are verified with PayPal itself (verify-webhook-signature), using this gateway's own webhook ID.
    async verifyWebhook(rawBody, headers) {
      if (!config.webhookId) return null;
      let event: { id?: string; event_type?: string; resource?: Record<string, unknown> };
      try { event = JSON.parse(rawBody); } catch { return null; }
      const need = ["paypal-auth-algo", "paypal-cert-url", "paypal-transmission-id", "paypal-transmission-sig", "paypal-transmission-time"].map((h) => headers.get(h));
      if (need.some((v) => !v)) return null;
      try {
        const v = await call<{ verification_status?: string }>("POST", "/v1/notifications/verify-webhook-signature", {
          auth_algo: need[0], cert_url: need[1], transmission_id: need[2], transmission_sig: need[3], transmission_time: need[4], webhook_id: config.webhookId, webhook_event: event,
        });
        if (v.verification_status !== "SUCCESS") return null;
      } catch { return null; }

      const type = event.event_type ?? "unknown";
      const r = (event.resource ?? {}) as { id?: string; custom_id?: string; amount?: Money; status?: string; purchase_units?: { custom_id?: string; reference_id?: string; amount?: Money }[] };
      if (type === "CHECKOUT.ORDER.APPROVED") {
        // The customer approved: take the money now. The capture result is the paid event (same id as the capture webhook).
        const pu = r.purchase_units?.[0];
        const ours = pu?.custom_id ?? pu?.reference_id ?? "";
        if (!r.id || !ours) return null;
        try {
          const c = await capture(r.id, ours);
          const cap = c.purchase_units?.[0]?.payments?.captures?.[0];
          if (c.status !== "COMPLETED" || !cap) return { eventId: event.id ?? `approved:${r.id}`, kind: "OTHER", providerOrderId: ours, amountMinor: null, method: "paypal", paymentRef: r.id };
          return { eventId: `capture:${cap.id ?? r.id}`, kind: "PAID", providerOrderId: ours, amountMinor: toMinor(cap.amount, cap.amount?.currency_code), method: "paypal", paymentRef: cap.id ?? r.id };
        } catch { return null; }
      }
      const kind = WEBHOOK_KIND[type] ?? "OTHER";
      return {
        eventId: kind === "PAID" ? `capture:${r.id ?? event.id}` : event.id ?? `${type}:${r.id ?? "none"}`,
        kind,
        providerOrderId: r.custom_id ?? "",
        amountMinor: toMinor(r.amount, r.amount?.currency_code),
        method: "paypal",
        paymentRef: r.id ?? null,
      };
    },

    async verify() {
      try {
        await accessToken();
        return { ok: true };
      } catch (e) {
        const status = e instanceof PaymentProviderError ? e.status : undefined;
        if (status === 401) return { ok: false, reason: "PayPal rejected these credentials. Check the Client ID and Secret, and that they are for the right mode (Sandbox or Live)." };
        return { ok: false, reason: e instanceof PaymentProviderError ? e.message : "Could not reach PayPal. Try again in a moment." };
      }
    },
  };
}
