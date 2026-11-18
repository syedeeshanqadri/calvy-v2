import { createCipheriv, createDecipheriv, createHash } from "node:crypto";
import {
  PaymentProviderError, type CreateOrderInput, type CreatedOrder, type OrderState, type PaymentProvider, type RefundInput,
} from "./provider";
import { postReturnUrl } from "./formPost";
import { toDecimalString } from "@/lib/currency";

// A business's OWN CCAvenue account (hosted page; the browser POSTs an AES-encrypted request). Calvy never touches the money.
// CCAvenue has no payment webhook: the customer's return page asks CCAvenue (Order Status Tracker) instead.
// Docs: https://www.ccavenue.com/ (integration kit)
export interface CCAvenueConfig { merchantId: string; workingKey: string; accessCode: string; mode: "TEST" | "LIVE" }

const HOSTS = { TEST: { pay: "https://test.ccavenue.com", api: "https://apitest.ccavenue.com" }, LIVE: { pay: "https://secure.ccavenue.com", api: "https://api.ccavenue.com" } } as const;
const IV = Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
const keyOf = (workingKey: string) => createHash("md5").update(workingKey).digest();

/** AES-128-CBC, key = md5(workingKey), fixed IV 0x00..0x0f, hex text: the integration kit's format. */
export function ccEncrypt(plain: string, workingKey: string): string {
  const c = createCipheriv("aes-128-cbc", keyOf(workingKey), IV);
  return Buffer.concat([c.update(plain, "utf8"), c.final()]).toString("hex");
}
export function ccDecrypt(hex: string, workingKey: string): string {
  const d = createDecipheriv("aes-128-cbc", keyOf(workingKey), IV);
  return Buffer.concat([d.update(Buffer.from(hex, "hex")), d.final()]).toString("utf8");
}

const clean = (v: string) => v.replace(/[&=]/g, " ").trim();

export function buildCCAvenueForm(input: CreateOrderInput, c: CCAvenueConfig): { url: string; fields: Record<string, string> } {
  const back = postReturnUrl(input.returnUrl, input.orderId);
  const plain = [
    ["merchant_id", c.merchantId], ["order_id", input.orderId], ["currency", "INR"], ["amount", toDecimalString(input.amountMinor, "INR")],
    ["redirect_url", back], ["cancel_url", back], ["language", "EN"],
    ["billing_name", clean(input.customer.name || "Customer")], ["billing_email", clean(input.customer.email)], ["billing_tel", clean(input.customer.phone)],
  ].map(([k, v]) => `${k}=${v}`).join("&");
  return { url: `${HOSTS[c.mode].pay}/transaction/transaction.do?command=initiateTransaction`, fields: { encRequest: ccEncrypt(plain, c.workingKey), access_code: c.accessCode } };
}

const PAID = new Set(["successful", "shipped"]);
const CLOSED = new Set(["unsuccessful", "aborted", "failure", "invalid", "timeout", "cancelled"]);

export function createCCAvenueProvider(config: CCAvenueConfig, fetchImpl: typeof fetch = fetch): PaymentProvider {
  /** One call to the CCAvenue API. Returns the decrypted answer, or throws with the reason. */
  async function api(command: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const body = new URLSearchParams({ enc_request: ccEncrypt(JSON.stringify(payload), config.workingKey), access_code: config.accessCode, request_type: "JSON", response_type: "JSON", command, version: "1.2" });
    const res = await fetchImpl(`${HOSTS[config.mode].api}/apis/servlet/DoWebTrans`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
    const text = await res.text();
    if (!res.ok) throw new PaymentProviderError(`CCAvenue ${command} failed: ${res.status}`, res.status);
    const f = new URLSearchParams(text.trim());
    if (f.get("status") !== "0" || !f.get("enc_response")) throw new PaymentProviderError(`CCAvenue ${command} refused: ${f.get("enc_response") ?? "unknown"}`, 401);
    try { return JSON.parse(ccDecrypt(f.get("enc_response")!.trim(), config.workingKey)) as Record<string, unknown>; } catch { throw new PaymentProviderError("CCAvenue answer could not be read", 401); }
  }
  const find = (o: unknown, key: string): string | undefined => {
    if (!o || typeof o !== "object") return undefined;
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (k.toLowerCase() === key && (typeof v === "string" || typeof v === "number")) return String(v);
      const inner = find(v, key);
      if (inner !== undefined) return inner;
    }
    return undefined;
  };

  return {
    name: "CCAVENUE",

    async createOrder(input): Promise<CreatedOrder> {
      const form = buildCCAvenueForm(input, config);
      return { providerOrderId: input.orderId, sessionId: form.url, post: form, expiresAt: null };
    },

    async getOrderState(orderId): Promise<OrderState> {
      const r = await api("orderStatusTracker", { reference_no: "", order_no: orderId });
      const s = (find(r, "order_status") ?? "").toLowerCase();
      if (PAID.has(s)) return "PAID";
      if (CLOSED.has(s)) return "TERMINATED";
      return "ACTIVE";
    },

    async refund(input: RefundInput) {
      const status = await api("orderStatusTracker", { reference_no: "", order_no: input.providerOrderId });
      const ref = find(status, "reference_no");
      if (!ref) throw new PaymentProviderError("CCAvenue has no payment for this order");
      const r = await api("refundOrder", { reference_no: ref, refund_amount: toDecimalString(input.amountMinor, "INR"), refund_ref_no: input.refundId.slice(0, 40) });
      if (find(r, "refund_status") === "1") throw new PaymentProviderError(`CCAvenue refund refused: ${find(r, "reason") ?? "unknown"}`);
      return { refundRef: input.refundId };
    },

    // No webhook exists for CCAvenue: nothing to verify.
    verifyWebhook() { return null; },

    async verify() {
      try {
        await api("orderStatusTracker", { reference_no: "", order_no: "calvy_verify_probe" });
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: e instanceof PaymentProviderError && e.status === 401 ? "CCAvenue rejected these details. Check the Merchant ID, Access Code and Working Key, and the mode (test or live)." : "Could not reach CCAvenue. Try again in a moment." };
      }
    },
  };
}
