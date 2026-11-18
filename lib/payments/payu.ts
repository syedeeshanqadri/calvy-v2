import { createHash, timingSafeEqual } from "node:crypto";
import {
  PaymentProviderError, type CreateOrderInput, type CreatedOrder, type OrderState, type PaymentEvent,
  type PaymentProvider, type RefundInput,
} from "./provider";
import { parseForm, postReturnUrl } from "./formPost";
import { toDecimalString, toMinorUnits } from "@/lib/currency";

// A business's OWN PayU account (PayU India hosted checkout: the browser POSTs a signed form to PayU). Calvy never touches the money.
// Key = Merchant Key, Salt = secret. Docs: https://docs.payu.in/docs/collect-payments-with-payu-hosted-checkout
export interface PayUConfig { merchantKey: string; salt: string; mode: "TEST" | "LIVE" }

const HOSTS = { TEST: { pay: "https://test.payu.in", api: "https://test.payu.in" }, LIVE: { pay: "https://secure.payu.in", api: "https://info.payu.in" } } as const;

const sha512 = (s: string) => createHash("sha512").update(s).digest("hex");

/** Request hash: sha512(key|txnid|amount|productinfo|firstname|email|udf1..udf5||||||salt). */
export function payuRequestHash(f: { key: string; txnid: string; amount: string; productinfo: string; firstname: string; email: string; udf?: string[] }, salt: string): string {
  const udf = [...(f.udf ?? []), "", "", "", "", ""].slice(0, 5);
  return sha512([f.key, f.txnid, f.amount, f.productinfo, f.firstname, f.email, ...udf, "", "", "", "", "", salt].join("|"));
}

/** Response / webhook hash: sha512(salt|status||||||udf5..udf1|email|firstname|productinfo|amount|txnid|key). */
export function payuResponseHash(f: Record<string, string>, salt: string): string {
  const udf = [f.udf5, f.udf4, f.udf3, f.udf2, f.udf1].map((v) => v ?? "");
  const head = f.additionalCharges ? [f.additionalCharges] : [];
  return sha512([...head, salt, f.status ?? "", "", "", "", "", "", ...udf, f.email ?? "", f.firstname ?? "", f.productinfo ?? "", f.amount ?? "", f.txnid ?? "", f.key ?? ""].join("|"));
}

/** Verify and normalise a PayU webhook (url-encoded form) with the business's Salt; null when the hash is wrong. */
export function parsePayUWebhook(rawBody: string, salt: string, merchantKey: string): PaymentEvent | null {
  const f = rawBody.trim().startsWith("{") ? (() => { try { return Object.fromEntries(Object.entries(JSON.parse(rawBody) as Record<string, unknown>).map(([k, v]) => [k, v == null ? "" : String(v)])); } catch { return null; } })() : parseForm(rawBody);
  if (!f || !f.hash || !f.txnid || !salt) return null;
  if (f.key && f.key !== merchantKey) return null;
  const expected = Buffer.from(payuResponseHash({ ...f, key: f.key || merchantKey }, salt));
  const got = Buffer.from(f.hash.toLowerCase());
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
  const status = (f.status ?? "").toLowerCase();
  const amount = Number(f.amount);
  return {
    eventId: `payu:${f.mihpayid || f.txnid}:${status}`,
    kind: status === "success" ? "PAID" : status === "failure" || status === "failed" ? "FAILED" : "OTHER",
    providerOrderId: f.txnid,
    amountMinor: Number.isFinite(amount) ? toMinorUnits(amount, "INR") : null,
    method: f.mode || null,
    paymentRef: f.mihpayid || null,
  };
}

export function buildPayUForm(input: CreateOrderInput, c: PayUConfig): { url: string; fields: Record<string, string> } {
  const back = postReturnUrl(input.returnUrl, input.orderId);
  const base = { key: c.merchantKey, txnid: input.orderId, amount: toDecimalString(input.amountMinor, "INR"), productinfo: (input.note ?? "Booking").replace(/[|]/g, " ").slice(0, 100) || "Booking", firstname: (input.customer.name || "Customer").replace(/[|]/g, " ").slice(0, 60), email: input.customer.email };
  return {
    url: `${HOSTS[c.mode].pay}/_payment`,
    fields: { ...base, phone: input.customer.phone, surl: back, furl: back, hash: payuRequestHash(base, c.salt) },
  };
}

export function createPayUProvider(config: PayUConfig, fetchImpl: typeof fetch = fetch): PaymentProvider {
  async function service<T extends Record<string, unknown>>(command: string, var1: string, extra: Record<string, string> = {}): Promise<T> {
    const body = new URLSearchParams({ key: config.merchantKey, command, var1, hash: sha512([config.merchantKey, command, var1, config.salt].join("|")), ...extra });
    const res = await fetchImpl(`${HOSTS[config.mode].api}/merchant/postservice.php?form=2`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body });
    const data = (await res.json().catch(() => null)) as T | null;
    if (!res.ok || !data) throw new PaymentProviderError(`PayU ${command} failed: ${res.status}`, res.status);
    return data;
  }
  type Details = { transaction_details?: Record<string, { status?: string; mihpayid?: string }>; msg?: string };

  return {
    name: "PAYU",

    async createOrder(input): Promise<CreatedOrder> {
      return { providerOrderId: input.orderId, sessionId: `${HOSTS[config.mode].pay}/_payment`, post: buildPayUForm(input, config), expiresAt: null };
    },

    async getOrderState(orderId) {
      const r = await service<Details>("verify_payment", orderId);
      const d = r.transaction_details?.[orderId];
      const s = (d?.status ?? "").toLowerCase();
      if (s === "success") return "PAID";
      if (s === "failure" || s === "failed" || s === "bounced") return "TERMINATED" as OrderState;
      return "ACTIVE";
    },

    async refund(input: RefundInput) {
      const r = await service<Details>("verify_payment", input.providerOrderId);
      const id = r.transaction_details?.[input.providerOrderId]?.mihpayid;
      if (!id || id === "Not Found") throw new PaymentProviderError("PayU has no payment for this order");
      const out = await service<{ status?: number; msg?: string; request_id?: string }>("cancel_refund_transaction", id, { var2: input.refundId.slice(0, 40), var3: toDecimalString(input.amountMinor, "INR") });
      if (out.status !== 1) throw new PaymentProviderError(`PayU refund refused: ${out.msg ?? "unknown"}`);
      return { refundRef: out.request_id ?? input.refundId };
    },

    verifyWebhook(rawBody) {
      return parsePayUWebhook(rawBody, config.salt, config.merchantKey);
    },

    async verify() {
      try {
        const r = await service<Details>("verify_payment", "calvy_verify_probe");
        // A wrong key or salt is refused with a message about the hash or the key; a probe for an unknown order is not an error.
        if (/invalid|hash|authent|key/i.test(r.msg ?? "") && !r.transaction_details) return { ok: false, reason: "PayU rejected these credentials. Check the Merchant Key and Salt, and the mode (test or live)." };
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: e instanceof PaymentProviderError ? e.message : "Could not reach PayU. Try again in a moment." };
      }
    },
  };
}
