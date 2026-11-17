// Calvy's own Cashfree Subscriptions (plan billing). ON_DEMAND plan: Calvy raises each charge (prorated first charge, retries).
// API version 2026-01-01. Written against Cashfree's docs; the points the docs leave open are marked UNVERIFIED and are checked in the
// sandbox before going live (docs/subscriptions-setup.md).
import { createHmac, timingSafeEqual } from "node:crypto";
import { PaymentProviderError } from "@/lib/payments/provider";

const API_VERSION = "2026-01-01";
const BASE = { sandbox: "https://sandbox.cashfree.com/pg", production: "https://api.cashfree.com/pg" } as const;

export interface SubsConfig { appId: string; secretKey: string; env: "sandbox" | "production" }

/** Minor units -> Cashfree amount (rupees). */
export const toRupees = (minor: number) => Math.round(minor) / 100;
const toMinor = (rupees: unknown) => (typeof rupees === "number" ? Math.round(rupees * 100) : null);

export interface CreateSubscriptionInput {
  /** Our id (max 250; alphanumerics, underscore, dot, hyphen). */
  subscriptionId: string;
  customer: { email: string; phone: string; name: string };
  planName: string;
  /** The mandate maximum: the plan's own price. */
  maxAmountMinor: number;
  /** upi_card: the authorisation payment is the first charge (>= Rs 1). enach: 0 (eNACH always authorises for 0). */
  authorizationAmountMinor: number;
  methods: ("upi" | "card" | "enach")[];
  returnUrl: string;
  expiresAt: Date;
  tags?: Record<string, string>;
}

export interface CreatedSubscription { subscriptionId: string; cfSubscriptionId: string | null; sessionId: string; status: string }

export interface FetchedSubscription {
  subscriptionId: string;
  status: string;
  /** ACTIVE once the customer authorised the mandate. */
  authorizationStatus: string | null;
  authorizationAmountMinor: number | null;
  nextScheduleDate: string | null;
}

export type SubsEventKind =
  | "AUTH_SUCCESS" | "AUTH_FAILED"
  | "PAYMENT_SUCCESS" | "PAYMENT_FAILED"
  | "ENDED" | "OTHER";

/** A verified webhook, normalised. */
export interface SubsEvent {
  /** Stable id for idempotency. */
  eventId: string;
  kind: SubsEventKind;
  subscriptionId: string;
  paymentId: string | null;
  amountMinor: number | null;
  /** upi | card | enach, when the event says. */
  method: string | null;
  /** The raw Cashfree status that decided `kind`, for the log. */
  status: string | null;
}

/** Cashfree webhook signature: base64(HMAC-SHA256(x-webhook-timestamp + rawBody, secret)). */
export function subsSignature(timestamp: string, rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(timestamp + rawBody).digest("base64");
}

const ENDED_STATUSES = new Set(["CUSTOMER_CANCELLED", "CANCELLED", "EXPIRED", "LINK_EXPIRED", "COMPLETED"]);

/**
 * Verify (against every candidate secret: the client secret, and a separate webhook secret if the account has one) and normalise a
 * subscription webhook. Null when the signature is missing or wrong, or the body is not what we expect.
 * A stale timestamp (older than 5 minutes) is rejected as a replay.
 */
export function parseSubsWebhook(rawBody: string, headers: Headers, secrets: string[], now = Date.now()): SubsEvent | null {
  const signature = headers.get("x-webhook-signature");
  const timestamp = headers.get("x-webhook-timestamp");
  if (!signature || !timestamp) return null;
  const given = Buffer.from(signature);
  const ok = secrets.filter(Boolean).some((s) => {
    const expected = Buffer.from(subsSignature(timestamp, rawBody, s));
    return expected.length === given.length && timingSafeEqual(expected, given);
  });
  if (!ok) return null;
  // The timestamp is in seconds or milliseconds; either way it must be recent.
  const t = Number(timestamp);
  if (Number.isFinite(t) && t > 0) {
    const ms = t < 1e12 ? t * 1000 : t;
    if (Math.abs(now - ms) > 5 * 60_000) return null;
  }

  let body: { type?: string; data?: Record<string, any> };
  try { body = JSON.parse(rawBody); } catch { return null; }
  const d = body.data ?? {};
  const type = body.type ?? "UNKNOWN";
  const subscriptionId: string | undefined = d.subscription_id ?? d.subscription_details?.subscription_id ?? d.subscription?.subscription_id;
  if (!subscriptionId) return null;
  const paymentId: string | null = d.payment_id ?? null;
  const amountMinor = toMinor(d.payment_amount);
  const method: string | null = d.authorization_details?.payment_method ?? d.payment_method ?? null;

  let kind: SubsEventKind = "OTHER";
  let status: string | null = null;
  if (type === "SUBSCRIPTION_AUTH_STATUS") {
    status = d.authorization_details?.authorization_status ?? d.payment_status ?? null;
    kind = status === "ACTIVE" || status === "SUCCESS" ? "AUTH_SUCCESS" : status === "FAILED" || status === "CANCELLED" ? "AUTH_FAILED" : "OTHER";
  } else if (type === "SUBSCRIPTION_PAYMENT_SUCCESS") { kind = "PAYMENT_SUCCESS"; status = d.payment_status ?? "SUCCESS"; }
  else if (type === "SUBSCRIPTION_PAYMENT_FAILED" || type === "SUBSCRIPTION_PAYMENT_CANCELLED") { kind = "PAYMENT_FAILED"; status = d.payment_status ?? "FAILED"; }
  else if (type === "SUBSCRIPTION_STATUS_CHANGED") {
    status = d.subscription_details?.subscription_status ?? null;
    if (status && ENDED_STATUSES.has(status)) kind = "ENDED";
  }
  return { eventId: `${type}:${paymentId ?? subscriptionId}:${status ?? ""}`, kind, subscriptionId, paymentId, amountMinor, method, status };
}

export interface SubsClient {
  createSubscription(i: CreateSubscriptionInput): Promise<CreatedSubscription>;
  getSubscription(subscriptionId: string): Promise<FetchedSubscription>;
  /** Raise a charge on the mandate. `scheduleDate` is the debit date (UPI and card need it; only the date is used). */
  charge(i: { subscriptionId: string; paymentId: string; amountMinor: number; scheduleDate: Date; remarks?: string }): Promise<{ paymentId: string; status: string }>;
  cancel(subscriptionId: string): Promise<void>;
}

export function createSubsClient(config: SubsConfig, fetchImpl: typeof fetch = fetch): SubsClient {
  const base = BASE[config.env];

  async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const res = await fetchImpl(`${base}${path}`, {
      method,
      headers: { "x-client-id": config.appId, "x-client-secret": config.secretKey, "x-api-version": API_VERSION, "Content-Type": "application/json", Accept: "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    // Never put request headers (credentials) in an error.
    if (!res.ok) throw new PaymentProviderError(`Cashfree subscriptions ${method} ${path.split("/")[1] ?? ""} failed: ${data.message ?? res.status}`, res.status);
    return data as T;
  }

  return {
    async createSubscription(i) {
      const r = await call<{ subscription_id: string; cf_subscription_id?: string | number; subscription_session_id: string; subscription_status?: string }>("POST", "/subscriptions", {
        subscription_id: i.subscriptionId,
        customer_details: { customer_email: i.customer.email, customer_phone: i.customer.phone, customer_name: i.customer.name.slice(0, 100) },
        plan_details: {
          plan_name: i.planName.slice(0, 40), plan_type: "ON_DEMAND", plan_currency: "INR", plan_max_amount: toRupees(i.maxAmountMinor),
        },
        authorization_details: {
          authorization_amount: toRupees(i.authorizationAmountMinor),
          // The authorisation payment of an upi/card start IS the first charge: it is kept, not refunded.
          authorization_amount_refund: false,
          payment_methods: i.methods,
        },
        subscription_meta: { return_url: i.returnUrl },
        subscription_expiry_time: i.expiresAt.toISOString(),
        ...(i.tags ? { subscription_tags: i.tags } : {}),
      });
      return { subscriptionId: r.subscription_id, cfSubscriptionId: r.cf_subscription_id != null ? String(r.cf_subscription_id) : null, sessionId: r.subscription_session_id, status: r.subscription_status ?? "INITIALIZED" };
    },

    async getSubscription(subscriptionId) {
      const r = await call<{ subscription_id: string; subscription_status?: string; authorisation_details?: { authorization_status?: string; authorization_amount?: number }; next_schedule_date?: string }>("GET", `/subscriptions/${encodeURIComponent(subscriptionId)}`);
      return {
        subscriptionId: r.subscription_id, status: r.subscription_status ?? "UNKNOWN",
        authorizationStatus: r.authorisation_details?.authorization_status ?? null,
        authorizationAmountMinor: toMinor(r.authorisation_details?.authorization_amount),
        nextScheduleDate: r.next_schedule_date ?? null,
      };
    },

    async charge(i) {
      const r = await call<{ payment_id?: string; payment_status?: string }>("POST", "/subscriptions/pay", {
        subscription_id: i.subscriptionId, payment_id: i.paymentId, payment_type: "CHARGE", payment_amount: toRupees(i.amountMinor),
        payment_schedule_date: i.scheduleDate.toISOString(), ...(i.remarks ? { payment_remarks: i.remarks.slice(0, 100) } : {}),
      });
      return { paymentId: r.payment_id ?? i.paymentId, status: r.payment_status ?? "INITIALIZED" };
    },

    async cancel(subscriptionId) {
      await call("POST", `/subscriptions/${encodeURIComponent(subscriptionId)}/manage`, { subscription_id: subscriptionId, action: "CANCEL" });
    },
  };
}

let cached: SubsClient | null | undefined;
/** Calvy's own Cashfree for plan billing; null without keys (callers must fail closed). */
export function getSubsClient(env: NodeJS.ProcessEnv = process.env): SubsClient | null {
  if (env === process.env && cached !== undefined) return cached;
  const c = env.CASHFREE_APP_ID && env.CASHFREE_SECRET_KEY
    ? createSubsClient({ appId: env.CASHFREE_APP_ID, secretKey: env.CASHFREE_SECRET_KEY, env: env.CASHFREE_ENV === "production" ? "production" : "sandbox" })
    : null;
  if (env === process.env) cached = c;
  return c;
}

/** Secrets that may sign a subscription webhook (client secret; plus a separate webhook secret when the account has one). */
export const webhookSecrets = (env: NodeJS.ProcessEnv = process.env) => [env.CASHFREE_SECRET_KEY, env.CASHFREE_SUBS_WEBHOOK_SECRET].filter((s): s is string => !!s);
