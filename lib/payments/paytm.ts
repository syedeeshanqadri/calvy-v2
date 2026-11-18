import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  PaymentProviderError, type CreateOrderInput, type CreatedOrder, type OrderState, type PaymentEvent,
  type PaymentProvider, type RefundInput,
} from "./provider";
import { parseForm, postReturnUrl } from "./formPost";
import { toDecimalString, toMinorUnits } from "@/lib/currency";

// A business's OWN Paytm Payment Gateway account (Initiate Transaction -> txnToken -> Paytm's payment page). Calvy never touches the money.
// MID = keyId, Merchant Key = secret, Website name in `extra`. Docs: https://developer.paytm.com/docs/api/initiate-transaction-api/
export interface PaytmConfig { mid: string; merchantKey: string; website: string; mode: "TEST" | "LIVE" }

const HOSTS = { TEST: "https://securegw-stage.paytm.in", LIVE: "https://securegw.paytm.in" } as const;
const IV = Buffer.from("@@@@&&&&####$$$$");
const SALT_CHARS = "9876543210ZYXWVUTSRQPONMLKJIHGFEDCBAabcdefghijklmnopqrstuvwxyz";

/** Paytm checksum: AES-128-CBC(key = merchant key, fixed IV) of sha256(params|salt)+salt, base64. */
export function paytmSign(params: string, key: string, salt = Array.from(randomBytes(4), (b) => SALT_CHARS[b % SALT_CHARS.length]).join("")): string {
  const hash = createHash("sha256").update(`${params}|${salt}`).digest("hex") + salt;
  const c = createCipheriv("aes-128-cbc", Buffer.from(key), IV);
  return Buffer.concat([c.update(hash, "utf8"), c.final()]).toString("base64");
}

export function paytmVerify(params: string, key: string, checksum: string): boolean {
  try {
    const d = createDecipheriv("aes-128-cbc", Buffer.from(key), IV);
    const plain = Buffer.concat([d.update(Buffer.from(checksum, "base64")), d.final()]).toString("utf8");
    const salt = plain.slice(-4);
    const want = Buffer.from(createHash("sha256").update(`${params}|${salt}`).digest("hex") + salt);
    const got = Buffer.from(plain);
    return want.length === got.length && timingSafeEqual(want, got);
  } catch {
    return false;
  }
}

/** The string Paytm signs for a callback/webhook: values sorted by key name, joined with "|", checksum itself left out. */
export function paytmParamString(fields: Record<string, string>): string {
  return Object.keys(fields).filter((k) => k !== "CHECKSUMHASH").sort().map((k) => (fields[k] === "null" ? "" : fields[k] ?? "")).join("|");
}

export function parsePaytmWebhook(rawBody: string, key: string): PaymentEvent | null {
  let f: Record<string, string>;
  try {
    f = rawBody.trim().startsWith("{") ? Object.fromEntries(Object.entries(JSON.parse(rawBody) as Record<string, unknown>).map(([k, v]) => [k, v == null ? "" : String(v)])) : parseForm(rawBody);
  } catch { return null; }
  if (!f.CHECKSUMHASH || !f.ORDERID || !key) return null;
  if (!paytmVerify(paytmParamString(f), key, f.CHECKSUMHASH)) return null;
  const status = f.STATUS ?? "";
  const amount = Number(f.TXNAMOUNT);
  return {
    eventId: `paytm:${f.TXNID || f.ORDERID}:${status}`,
    kind: status === "TXN_SUCCESS" ? "PAID" : status === "TXN_FAILURE" ? "FAILED" : "OTHER",
    providerOrderId: f.ORDERID,
    amountMinor: Number.isFinite(amount) ? toMinorUnits(amount, "INR") : null,
    method: f.PAYMENTMODE || null,
    paymentRef: f.TXNID || null,
  };
}

export function createPaytmProvider(config: PaytmConfig, fetchImpl: typeof fetch = fetch): PaymentProvider {
  const host = HOSTS[config.mode];
  async function call<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const res = await fetchImpl(`${host}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body, head: { signature: paytmSign(JSON.stringify(body), config.merchantKey) } }) });
    const data = (await res.json().catch(() => null)) as { body?: T } | null;
    if (!res.ok || !data?.body) throw new PaymentProviderError(`Paytm ${path.split("/").pop()} failed: ${res.status}`, res.status);
    return data.body;
  }
  type Result = { resultInfo?: { resultStatus?: string; resultCode?: string; resultMsg?: string }; txnToken?: string; txnId?: string };

  return {
    name: "PAYTM",

    async createOrder(input): Promise<CreatedOrder> {
      const r = await call<Result>(`/theia/api/v1/initiateTransaction?mid=${encodeURIComponent(config.mid)}&orderId=${encodeURIComponent(input.orderId)}`, {
        requestType: "Payment", mid: config.mid, websiteName: config.website, orderId: input.orderId, callbackUrl: postReturnUrl(input.returnUrl, input.orderId),
        txnAmount: { value: toDecimalString(input.amountMinor, "INR"), currency: "INR" }, userInfo: { custId: input.customer.id.slice(0, 64), mobile: input.customer.phone, email: input.customer.email },
      });
      if (r.resultInfo?.resultStatus !== "S" || !r.txnToken) throw new PaymentProviderError(`Paytm refused the order: ${r.resultInfo?.resultMsg ?? "unknown"}`);
      const url = `${host}/theia/api/v1/showPaymentPage?mid=${encodeURIComponent(config.mid)}&orderId=${encodeURIComponent(input.orderId)}`;
      return { providerOrderId: input.orderId, sessionId: url, post: { url, fields: { mid: config.mid, orderId: input.orderId, txnToken: r.txnToken } }, expiresAt: null };
    },

    async getOrderState(orderId): Promise<OrderState> {
      const r = await call<Result>("/v3/order/status", { mid: config.mid, orderId });
      const s = r.resultInfo?.resultStatus;
      if (s === "TXN_SUCCESS") return "PAID";
      if (s === "TXN_FAILURE") return "TERMINATED";
      return "ACTIVE";
    },

    async refund(input: RefundInput) {
      const st = await call<Result>("/v3/order/status", { mid: config.mid, orderId: input.providerOrderId });
      if (!st.txnId) throw new PaymentProviderError("Paytm has no payment for this order");
      const r = await call<Result & { refundId?: string }>("/refund/apply", { mid: config.mid, txnType: "REFUND", orderId: input.providerOrderId, txnId: st.txnId, refId: input.refundId.slice(0, 40), refundAmount: toDecimalString(input.amountMinor, "INR") });
      if (r.resultInfo?.resultStatus === "TXN_FAILURE") throw new PaymentProviderError(`Paytm refund refused: ${r.resultInfo.resultMsg ?? "unknown"}`);
      return { refundRef: r.refundId ?? input.refundId };
    },

    verifyWebhook(rawBody) {
      return parsePaytmWebhook(rawBody, config.merchantKey);
    },

    async verify() {
      if (Buffer.byteLength(config.merchantKey) !== 16) return { ok: false, reason: "The Merchant Key should be exactly 16 characters. Copy it again from the Paytm dashboard." };
      try {
        const r = await call<Result>("/v3/order/status", { mid: config.mid, orderId: "calvy_verify_probe" });
        // 334 = "invalid order id": the MID and key were accepted. 330 = checksum mismatch, 335 = unknown MID.
        const code = r.resultInfo?.resultCode;
        if (code === "330" || code === "335" || code === "501") return { ok: false, reason: "Paytm rejected these details. Check the MID and Merchant Key, and the mode (staging or production)." };
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: e instanceof PaymentProviderError ? e.message : "Could not reach Paytm. Try again in a moment." };
      }
    },
  };
}
