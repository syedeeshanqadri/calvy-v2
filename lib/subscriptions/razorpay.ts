// Razorpay for INTERNATIONAL businesses buying Calvy plans (USD, cards). India plan billing is Cashfree and never touches this file.
//  - Config comes from RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET. The values are never logged or returned.
//  - A live key (rzp_live_...) is refused unless NODE_ENV=production, so a developer's machine cannot take real money.
//  - The API client takes a fetch so tests never touch the network. Written against Razorpay's Subscriptions API; see docs/razorpay-international.md.
import { createHmac, timingSafeEqual } from "node:crypto";

const BASE = "https://api.razorpay.com/v1";

export interface RazorpayConfig { keyId: string; keySecret: string; webhookSecret: string | null; live: boolean }
export type ConfigResult = { ok: true; config: RazorpayConfig } | { ok: false; reason: "missing" | "live_key_outside_production" };

/** Read the three env names. Missing keys, or a live key outside production, give no config at all (never a half-working one). */
export function razorpayConfig(env: NodeJS.ProcessEnv = process.env): ConfigResult {
  const keyId = (env.RAZORPAY_KEY_ID ?? "").trim();
  const keySecret = (env.RAZORPAY_KEY_SECRET ?? "").trim();
  if (!keyId || !keySecret) return { ok: false, reason: "missing" };
  const live = keyId.startsWith("rzp_live_");
  if (live && env.NODE_ENV !== "production") return { ok: false, reason: "live_key_outside_production" };
  return { ok: true, config: { keyId, keySecret, webhookSecret: (env.RAZORPAY_WEBHOOK_SECRET ?? "").trim() || null, live } };
}

/** Billing in USD only: Razorpay is never used for rupees. */
export const RAZORPAY_BILLING_CURRENCY = "USD" as const;

export class RazorpayApiError extends Error {
  constructor(public status: number, public code: string | null, public description: string) {
    super(`Razorpay ${status}${code ? ` ${code}` : ""}: ${description}`);
    this.name = "RazorpayApiError";
  }
}

/**
 * Did Razorpay refuse recurring for this currency or card (so the caller should fall back to payment links), as opposed to a transient or
 * programming error (which must not silently change how a business is billed)? Only a 400 that says so counts.
 */
export function isRecurringUnsupported(err: unknown): boolean {
  if (!(err instanceof RazorpayApiError) || err.status !== 400) return false;
  return /(currency|international|recurring|not (enabled|supported|allowed)|subscription.*(not|disabled))/i.test(`${err.code ?? ""} ${err.description}`);
}

export interface RzpAddon { item: { name: string; amount: number; currency: string } }
export interface RzpSubscription { id: string; status: string; planId: string | null; startAt: number | null; currentEnd: number | null; paidCount: number | null; shortUrl: string | null; notes: Record<string, string> }
export interface RzpPaymentLink { id: string; shortUrl: string; status: string }

export interface RazorpayClient {
  createPlan(i: { period: "monthly" | "yearly"; name: string; amountMinor: number }): Promise<{ id: string }>;
  createSubscription(i: { planId: string; totalCount: number; startAt?: number; addons?: RzpAddon[]; notes: Record<string, string> }): Promise<RzpSubscription>;
  fetchSubscription(id: string): Promise<RzpSubscription>;
  cancelSubscription(id: string, atCycleEnd: boolean): Promise<void>;
  updateSubscriptionPlan(id: string, planId: string): Promise<void>;
  createPaymentLink(i: { amountMinor: number; description: string; referenceId: string; customer: { name: string; email: string }; notes: Record<string, string>; expireBy?: number }): Promise<RzpPaymentLink>;
}

const asSub = (j: any): RzpSubscription => ({
  id: String(j.id), status: String(j.status ?? ""), planId: j.plan_id ?? null, startAt: typeof j.start_at === "number" ? j.start_at : null,
  currentEnd: typeof j.current_end === "number" ? j.current_end : null, paidCount: typeof j.paid_count === "number" ? j.paid_count : null,
  shortUrl: j.short_url ?? null, notes: j.notes && typeof j.notes === "object" && !Array.isArray(j.notes) ? j.notes : {},
});

export function makeRazorpayClient(cfg: RazorpayConfig, fetchImpl: typeof fetch = fetch): RazorpayClient {
  const auth = `Basic ${Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString("base64")}`;
  async function call(method: string, path: string, body?: unknown): Promise<any> {
    const res = await fetchImpl(`${BASE}${path}`, { method, headers: { Authorization: auth, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new RazorpayApiError(res.status, json?.error?.code ?? null, String(json?.error?.description ?? res.statusText ?? "request failed"));
    return json;
  }
  return {
    createPlan: async (i) => ({ id: String((await call("POST", "/plans", { period: i.period, interval: 1, item: { name: i.name.slice(0, 100), amount: i.amountMinor, currency: RAZORPAY_BILLING_CURRENCY } })).id) }),
    createSubscription: async (i) => asSub(await call("POST", "/subscriptions", {
      plan_id: i.planId, total_count: i.totalCount, quantity: 1, customer_notify: 1, notes: i.notes,
      ...(i.startAt ? { start_at: i.startAt } : {}), ...(i.addons?.length ? { addons: i.addons } : {}),
    })),
    fetchSubscription: async (id) => asSub(await call("GET", `/subscriptions/${encodeURIComponent(id)}`)),
    cancelSubscription: async (id, atCycleEnd) => { await call("POST", `/subscriptions/${encodeURIComponent(id)}/cancel`, { cancel_at_cycle_end: atCycleEnd ? 1 : 0 }); },
    updateSubscriptionPlan: async (id, planId) => { await call("PATCH", `/subscriptions/${encodeURIComponent(id)}`, { plan_id: planId, schedule_change_at: "cycle_end" }); },
    createPaymentLink: async (i) => {
      const j = await call("POST", "/payment_links", {
        amount: i.amountMinor, currency: RAZORPAY_BILLING_CURRENCY, description: i.description.slice(0, 250), reference_id: i.referenceId.slice(0, 40),
        customer: { name: i.customer.name, email: i.customer.email }, notify: { email: false, sms: false }, reminder_enable: false, notes: i.notes,
        ...(i.expireBy ? { expire_by: i.expireBy } : {}),
      });
      return { id: String(j.id), shortUrl: String(j.short_url), status: String(j.status ?? "created") };
    },
  };
}

// ── Signatures ──
const hex = (secret: string, message: string) => createHmac("sha256", secret).update(message).digest("hex");
function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8"), y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Webhook: HMAC-SHA256 of the RAW body with the webhook secret, compared in constant time. No header or no secret never verifies. */
export function verifyWebhookSignature(rawBody: string, signature: string | null | undefined, secret: string | null | undefined): boolean {
  if (!signature || !secret) return false;
  return safeEqualHex(hex(secret, rawBody), signature.trim().toLowerCase());
}

/** Checkout success callback: HMAC-SHA256 of "payment_id|subscription_id" with the KEY SECRET. */
export function verifyCheckoutSignature(paymentId: string, subscriptionId: string, signature: string | null | undefined, keySecret: string | null | undefined): boolean {
  if (!signature || !keySecret || !paymentId || !subscriptionId) return false;
  return safeEqualHex(hex(keySecret, `${paymentId}|${subscriptionId}`), signature.trim().toLowerCase());
}

// ── Webhook events ──
export type RzpEventKind = "AUTHENTICATED" | "ACTIVATED" | "CHARGED" | "PENDING" | "HALTED" | "CANCELLED" | "COMPLETED" | "LINK_PAID" | "OTHER";
export interface RzpPayment { id: string; amountMinor: number; currency: string; status: string; method: string | null }
export interface RzpEvent {
  event: string;
  kind: RzpEventKind;
  subscriptionId: string | null;
  payment: RzpPayment | null;
  /** payment_link.paid: the link id and the notes Calvy put on it (which subscription and period it pays for). */
  link: { id: string; notes: Record<string, string> } | null;
}

const KIND: Record<string, RzpEventKind> = {
  "subscription.authenticated": "AUTHENTICATED", "subscription.activated": "ACTIVATED", "subscription.charged": "CHARGED", "subscription.pending": "PENDING",
  "subscription.halted": "HALTED", "subscription.cancelled": "CANCELLED", "subscription.completed": "COMPLETED", "payment_link.paid": "LINK_PAID",
};

/** Normalise a verified webhook body. Returns null when it is not JSON of the expected shape. */
export function parseRazorpayEvent(rawBody: string): RzpEvent | null {
  let j: any;
  try { j = JSON.parse(rawBody); } catch { return null; }
  if (!j || typeof j.event !== "string") return null;
  const p = j.payload?.payment?.entity;
  const sub = j.payload?.subscription?.entity;
  const link = j.payload?.payment_link?.entity;
  return {
    event: j.event,
    kind: KIND[j.event] ?? "OTHER",
    subscriptionId: typeof sub?.id === "string" ? sub.id : typeof p?.subscription_id === "string" ? p.subscription_id : null,
    payment: p && typeof p.id === "string" && typeof p.amount === "number" ? { id: p.id, amountMinor: p.amount, currency: String(p.currency ?? "").toUpperCase(), status: String(p.status ?? ""), method: p.method ?? null } : null,
    link: link && typeof link.id === "string" ? { id: link.id, notes: link.notes && typeof link.notes === "object" && !Array.isArray(link.notes) ? link.notes : {} } : null,
  };
}
