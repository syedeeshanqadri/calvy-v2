import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { createHash } from "node:crypto";
import { createStripeProvider, parseStripeWebhook, stripeForm, stripeSignature, buildStripeSession } from "@/lib/payments/stripe";
import { createPayPalProvider, buildPayPalOrder } from "@/lib/payments/paypal";
import { createPayUProvider, parsePayUWebhook, payuRequestHash, payuResponseHash, buildPayUForm } from "@/lib/payments/payu";
import { createCCAvenueProvider, ccDecrypt, ccEncrypt, buildCCAvenueForm } from "@/lib/payments/ccavenue";
import { createPaytmProvider, parsePaytmWebhook, paytmParamString, paytmSign, paytmVerify } from "@/lib/payments/paytm";
import { encryptCredentials, modeMismatch, providerForGateway } from "@/lib/payments/gateways";
import { postReturnUrl } from "@/lib/payments/formPost";

beforeEach(() => { process.env.NEXTAUTH_SECRET = "test-secret"; });

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const asFetch = (f: unknown) => f as unknown as typeof fetch;
const call = (f: ReturnType<typeof vi.fn>, i = 0) => f.mock.calls[i] as unknown as [string, RequestInit];

const usd = {
  orderId: "calvy_a1", amountMinor: 4999, currency: "USD",
  customer: { id: "c1", name: "Ann Lee", email: "ann@x.com", phone: "" },
  returnUrl: "https://calvy.io/booking/return?order_id={order_id}", note: "Haircut · Salon",
};
const inr = { ...usd, amountMinor: 1000, currency: "INR", customer: { ...usd.customer, phone: "9800000001" } };

describe("Stripe (the business's own account, no Connect)", () => {
  it("creates a Checkout Session in the business currency with our order id as the reference", async () => {
    const f = vi.fn(async () => json({ id: "cs_1", url: "https://checkout.stripe.com/c/pay/cs_1", expires_at: 1900000000 }));
    const r = await createStripeProvider({ secretKey: "rk_test_x" }, asFetch(f)).createOrder({ ...usd, expiresAt: new Date(Date.now() + 600_000) });
    expect(r).toMatchObject({ providerOrderId: "calvy_a1", gatewayRef: "cs_1", sessionId: "https://checkout.stripe.com/c/pay/cs_1", redirect: true });
    const [url, init] = call(f);
    expect(url).toBe("https://api.stripe.com/v1/checkout/sessions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer rk_test_x");
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe("create-calvy_a1");
    const form = new URLSearchParams(String(init.body));
    expect(form.get("mode")).toBe("payment");
    expect(form.get("client_reference_id")).toBe("calvy_a1");
    expect(form.get("line_items[0][price_data][currency]")).toBe("usd");
    expect(form.get("line_items[0][price_data][unit_amount]")).toBe("4999");
    expect(form.get("success_url")).toBe("https://calvy.io/booking/return?order_id=calvy_a1");
    expect(Number(form.get("expires_at")) * 1000).toBeGreaterThan(Date.now() + 30 * 60_000);
  });
  it("zero-decimal currency: JPY amount goes as whole yen", () => {
    expect(buildStripeSession({ ...usd, currency: "JPY", amountMinor: 5000 }).line_items[0].price_data.unit_amount).toBe(5000);
  });
  it("form encoding nests keys the way Stripe expects", () => {
    expect(stripeForm({ a: { b: [1, 2] }, c: "x y" })).toBe("a%5Bb%5D%5B0%5D=1&a%5Bb%5D%5B1%5D=2&c=x%20y");
  });
  const raw = JSON.stringify({ id: "evt_1", type: "checkout.session.completed", data: { object: { id: "cs_1", client_reference_id: "calvy_a1", amount_total: 4999, payment_status: "paid", payment_intent: "pi_1" } } });
  const sign = (body: string, secret: string, t: number) => new Headers({ "stripe-signature": `t=${t},v1=${stripeSignature(body, secret, t)}` });
  it("webhook: a valid signature on the RAW body is accepted", () => {
    const t = Math.floor(Date.now() / 1000);
    expect(parseStripeWebhook(raw, sign(raw, "whsec_a", t), "whsec_a")).toEqual({ eventId: "evt_1", kind: "PAID", providerOrderId: "calvy_a1", amountMinor: 4999, method: "card", paymentRef: "pi_1" });
  });
  it("webhook: wrong secret, edited body, missing header and old timestamps are rejected", () => {
    const t = Math.floor(Date.now() / 1000);
    expect(parseStripeWebhook(raw, sign(raw, "whsec_other", t), "whsec_a")).toBeNull();
    expect(parseStripeWebhook(raw + " ", sign(raw, "whsec_a", t), "whsec_a")).toBeNull();
    expect(parseStripeWebhook(raw, new Headers(), "whsec_a")).toBeNull();
    expect(parseStripeWebhook(raw, sign(raw, "whsec_a", t), "")).toBeNull();
    expect(parseStripeWebhook(raw, sign(raw, "whsec_a", t - 3600), "whsec_a")).toBeNull();
  });
  it("webhook: a session completed but not paid yet is not PAID; async success is", () => {
    const t = Math.floor(Date.now() / 1000);
    const unpaid = raw.replace('"paid"', '"unpaid"');
    expect(parseStripeWebhook(unpaid, sign(unpaid, "whsec_a", t), "whsec_a")?.kind).toBe("OTHER");
    const later = JSON.stringify({ id: "evt_2", type: "checkout.session.async_payment_succeeded", data: { object: { id: "cs_1", client_reference_id: "calvy_a1", amount_total: 4999, payment_status: "paid" } } });
    expect(parseStripeWebhook(later, sign(later, "whsec_a", t), "whsec_a")?.kind).toBe("PAID");
  });
  it("order state and refund use the session", async () => {
    const f = vi.fn(async (url: string) => url.includes("/refunds") ? json({ id: "re_1" }) : json({ status: "complete", payment_status: "paid", payment_intent: "pi_1" }));
    const p = createStripeProvider({ secretKey: "rk_test_x" }, asFetch(f));
    expect(await p.getOrderState("calvy_a1", "cs_1")).toBe("PAID");
    expect(await p.getOrderState("calvy_a1", null)).toBe("UNKNOWN");
    expect(await p.refund({ providerOrderId: "calvy_a1", gatewayRef: "cs_1", refundId: "rf_1", amountMinor: 1000 })).toEqual({ refundRef: "re_1" });
    const refundCall = f.mock.calls.find((c) => String((c as unknown[])[0]).endsWith("/refunds")) as unknown as [string, RequestInit];
    const form = new URLSearchParams(String(refundCall[1].body));
    expect(form.get("payment_intent")).toBe("pi_1");
    expect(form.get("amount")).toBe("1000");
  });
  it("verify: ok, a clear 401 and a clear permission message, with no key in either", async () => {
    expect(await createStripeProvider({ secretKey: "rk_test_x" }, asFetch(async () => json({ data: [] }))).verify!()).toEqual({ ok: true });
    const bad = await createStripeProvider({ secretKey: "rk_test_x" }, asFetch(async () => json({ error: { message: "Invalid API Key provided: rk_test_x" } }, 401))).verify!();
    expect(bad.ok).toBe(false);
    expect(JSON.stringify(bad)).not.toContain("rk_test_x");
    const perm = await createStripeProvider({ secretKey: "rk_test_x" }, asFetch(async () => json({ error: { message: "x" } }, 403))).verify!();
    expect(JSON.stringify(perm)).toMatch(/Checkout Sessions/);
  });
});

describe("PayPal (Orders v2, sandbox/live)", () => {
  const cfg = { clientId: "cid", clientSecret: "csecret", mode: "TEST" as const, webhookId: "WH-1" };
  const route = (handlers: Record<string, (init: RequestInit) => Response>) =>
    vi.fn(async (url: string, init: RequestInit) => {
      const key = Object.keys(handlers).find((k) => String(url).includes(k));
      return key ? handlers[key](init) : json({ message: "unexpected " + url }, 500);
    });
  const oauth = { "/v1/oauth2/token": () => json({ access_token: "tok", expires_in: 3000 }) };

  it("sandbox vs live base url; verify gets a token with the client credentials", async () => {
    const f = route(oauth);
    expect(await createPayPalProvider(cfg, asFetch(f)).verify!()).toEqual({ ok: true });
    const [url, init] = call(f);
    expect(url).toBe("https://api-m.sandbox.paypal.com/v1/oauth2/token");
    expect((init.headers as Record<string, string>).Authorization).toBe("Basic " + Buffer.from("cid:csecret").toString("base64"));
    const live = route(oauth);
    await createPayPalProvider({ ...cfg, mode: "LIVE" }, asFetch(live)).verify!();
    expect(call(live)[0]).toBe("https://api-m.paypal.com/v1/oauth2/token");
    const bad = await createPayPalProvider(cfg, asFetch(async () => json({ error_description: "Client Authentication failed" }, 401))).verify!();
    expect(bad.ok).toBe(false);
    expect(JSON.stringify(bad)).not.toMatch(/csecret/);
  });
  it("creates an order with the decimal amount in the business currency and our id", async () => {
    const f = route({ ...oauth, "/v2/checkout/orders": () => json({ id: "PP-1", links: [{ rel: "payer-action", href: "https://www.paypal.com/checkoutnow?token=PP-1" }] }) });
    const r = await createPayPalProvider(cfg, asFetch(f)).createOrder(usd);
    expect(r).toMatchObject({ providerOrderId: "calvy_a1", gatewayRef: "PP-1", sessionId: "https://www.paypal.com/checkoutnow?token=PP-1", redirect: true });
    const body = JSON.parse(String(call(f, 1)[1].body));
    expect(body.intent).toBe("CAPTURE");
    expect(body.purchase_units[0]).toMatchObject({ custom_id: "calvy_a1", amount: { currency_code: "USD", value: "49.99" } });
    expect(body.payment_source.paypal.experience_context.return_url).toBe("https://calvy.io/booking/return?order_id=calvy_a1");
  });
  it("JPY has no decimals", () => {
    expect(buildPayPalOrder({ ...usd, currency: "JPY", amountMinor: 5000 }).purchase_units[0].amount).toEqual({ currency_code: "JPY", value: "5000" });
  });
  const hdr = () => new Headers({ "paypal-auth-algo": "SHA256withRSA", "paypal-cert-url": "https://api.paypal.com/cert", "paypal-transmission-id": "t1", "paypal-transmission-sig": "sig", "paypal-transmission-time": "2026-01-01T00:00:00Z" });
  const capEvent = JSON.stringify({ id: "WH-EVT-1", event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { id: "CAP-1", custom_id: "calvy_a1", amount: { value: "49.99", currency_code: "USD" } } });
  it("webhook: verified with PayPal using the business's webhook id, then normalised", async () => {
    const f = route({ ...oauth, "/v1/notifications/verify-webhook-signature": () => json({ verification_status: "SUCCESS" }) });
    const ev = await createPayPalProvider(cfg, asFetch(f)).verifyWebhook(capEvent, hdr());
    expect(ev).toEqual({ eventId: "capture:CAP-1", kind: "PAID", providerOrderId: "calvy_a1", amountMinor: 4999, method: "paypal", paymentRef: "CAP-1" });
    const sent = JSON.parse(String(call(f, 1)[1].body));
    expect(sent).toMatchObject({ webhook_id: "WH-1", transmission_id: "t1", cert_url: "https://api.paypal.com/cert" });
  });
  it("webhook: a failed verification, missing headers, a missing webhook id or bad JSON is rejected", async () => {
    const fail = route({ ...oauth, "/v1/notifications/verify-webhook-signature": () => json({ verification_status: "FAILURE" }) });
    expect(await createPayPalProvider(cfg, asFetch(fail)).verifyWebhook(capEvent, hdr())).toBeNull();
    expect(await createPayPalProvider(cfg, asFetch(fail)).verifyWebhook(capEvent, new Headers())).toBeNull();
    expect(await createPayPalProvider({ ...cfg, webhookId: null }, asFetch(fail)).verifyWebhook(capEvent, hdr())).toBeNull();
    expect(await createPayPalProvider(cfg, asFetch(fail)).verifyWebhook("not json", hdr())).toBeNull();
    const down = vi.fn(async () => { throw new Error("network"); });
    expect(await createPayPalProvider(cfg, asFetch(down)).verifyWebhook(capEvent, hdr())).toBeNull();
  });
  it("webhook: an approved order is captured, and the capture is the paid event (same id as the capture webhook)", async () => {
    const approved = JSON.stringify({ id: "WH-EVT-2", event_type: "CHECKOUT.ORDER.APPROVED", resource: { id: "PP-1", purchase_units: [{ custom_id: "calvy_a1" }] } });
    const f = route({
      ...oauth,
      "/v1/notifications/verify-webhook-signature": () => json({ verification_status: "SUCCESS" }),
      "/v2/checkout/orders/PP-1/capture": () => json({ status: "COMPLETED", purchase_units: [{ payments: { captures: [{ id: "CAP-1", amount: { value: "49.99", currency_code: "USD" } }] } }] }),
    });
    expect(await createPayPalProvider(cfg, asFetch(f)).verifyWebhook(approved, hdr())).toMatchObject({ eventId: "capture:CAP-1", kind: "PAID", providerOrderId: "calvy_a1", amountMinor: 4999 });
    const capCall = f.mock.calls.find((c) => String((c as unknown[])[0]).endsWith("/capture")) as unknown as [string, RequestInit];
    expect((capCall[1].headers as Record<string, string>)["PayPal-Request-Id"]).toBe("capture-calvy_a1");
  });
  it("the return page's state check captures an approved order, so a missing webhook cannot strand a payment", async () => {
    const f = route({ ...oauth, "/v2/checkout/orders/PP-1/capture": () => json({ status: "COMPLETED", purchase_units: [] }), "/v2/checkout/orders/PP-1": () => json({ status: "APPROVED" }) });
    expect(await createPayPalProvider(cfg, asFetch(f)).getOrderState("calvy_a1", "PP-1")).toBe("PAID");
    const created = route({ ...oauth, "/v2/checkout/orders/PP-1": () => json({ status: "CREATED" }) });
    expect(await createPayPalProvider(cfg, asFetch(created)).getOrderState("calvy_a1", "PP-1")).toBe("ACTIVE");
  });
});

describe("PayU (India hosted checkout)", () => {
  const c = { merchantKey: "gtKFFx", salt: "eCwWELxi", mode: "TEST" as const };
  it("request hash follows PayU's formula", () => {
    const f = { key: "gtKFFx", txnid: "calvy_a1", amount: "10.00", productinfo: "Fee", firstname: "Riya", email: "r@x.com" };
    expect(payuRequestHash(f, "eCwWELxi")).toBe(createHash("sha512").update("gtKFFx|calvy_a1|10.00|Fee|Riya|r@x.com|||||||||||eCwWELxi").digest("hex"));
  });
  it("builds the signed form to POST, with the post-return url and a decimal amount", () => {
    const form = buildPayUForm(inr, c);
    expect(form.url).toBe("https://test.payu.in/_payment");
    expect(form.fields).toMatchObject({ key: "gtKFFx", txnid: "calvy_a1", amount: "10.00", email: "ann@x.com", surl: "https://calvy.io/api/payments/return?order_id=calvy_a1", furl: "https://calvy.io/api/payments/return?order_id=calvy_a1" });
    expect(form.fields.hash).toMatch(/^[0-9a-f]{128}$/);
    expect(buildPayUForm(inr, { ...c, mode: "LIVE" }).url).toBe("https://secure.payu.in/_payment");
  });
  const fields = { key: "gtKFFx", txnid: "calvy_a1", amount: "10.00", productinfo: "Fee", firstname: "Riya", email: "r@x.com", status: "success", mihpayid: "403993715", mode: "UPI" };
  const body = (over: Record<string, string> = {}, salt = "eCwWELxi") => { const f = { ...fields, ...over }; return new URLSearchParams({ ...f, hash: payuResponseHash(f, salt) }).toString(); };
  it("webhook: a correct reverse hash is accepted and normalised", () => {
    expect(parsePayUWebhook(body(), c.salt, c.merchantKey)).toEqual({ eventId: "payu:403993715:success", kind: "PAID", providerOrderId: "calvy_a1", amountMinor: 1000, method: "UPI", paymentRef: "403993715" });
    expect(parsePayUWebhook(body({ status: "failure" }), c.salt, c.merchantKey)?.kind).toBe("FAILED");
  });
  it("webhook: wrong salt, tampered amount, other merchant key or no hash are rejected", () => {
    expect(parsePayUWebhook(body({}, "other"), c.salt, c.merchantKey)).toBeNull();
    expect(parsePayUWebhook(body().replace("amount=10.00", "amount=1.00"), c.salt, c.merchantKey)).toBeNull();
    expect(parsePayUWebhook(body(), c.salt, "someoneElse")).toBeNull();
    expect(parsePayUWebhook("status=success&txnid=x", c.salt, c.merchantKey)).toBeNull();
  });
  it("order state, verify and a refused refund through the post-service api", async () => {
    const f = vi.fn(async (_u: string, init: RequestInit) => {
      const cmd = new URLSearchParams(String(init.body)).get("command");
      if (cmd === "verify_payment") return json({ status: 1, msg: "ok", transaction_details: { calvy_a1: { status: "success", mihpayid: "403993715" } } });
      return json({ status: 0, msg: "Refund not allowed" });
    });
    const p = createPayUProvider(c, asFetch(f));
    expect(await p.getOrderState("calvy_a1")).toBe("PAID");
    expect(call(f)[0]).toBe("https://test.payu.in/merchant/postservice.php?form=2");
    const sent = new URLSearchParams(String(call(f)[1].body));
    expect(sent.get("hash")).toBe(createHash("sha512").update("gtKFFx|verify_payment|calvy_a1|eCwWELxi").digest("hex"));
    expect(await p.verify!()).toEqual({ ok: true });
    await expect(p.refund({ providerOrderId: "calvy_a1", refundId: "rf1", amountMinor: 1000 })).rejects.toThrow(/refused/);
    const bad = await createPayUProvider(c, asFetch(async () => json({ status: 0, msg: "Invalid hash" }))).verify!();
    expect(bad.ok).toBe(false);
    expect(JSON.stringify(bad)).not.toContain("eCwWELxi");
  });
});

describe("CCAvenue (India hosted page, no webhook)", () => {
  const c = { merchantId: "12345", workingKey: "0123456789abcdef0123456789abcdef", accessCode: "AVXX", mode: "TEST" as const };
  it("encrypts and decrypts with the integration-kit scheme", () => {
    const enc = ccEncrypt("merchant_id=1&order_id=x", c.workingKey);
    expect(enc).toMatch(/^[0-9a-f]+$/);
    expect(ccDecrypt(enc, c.workingKey)).toBe("merchant_id=1&order_id=x");
    expect(() => ccDecrypt(enc, "wrong-key")).toThrow();
  });
  it("builds the encrypted form POST: INR amount, our order id, post-return url, no secrets in the plain fields", () => {
    const form = buildCCAvenueForm(inr, c);
    expect(form.url).toBe("https://test.ccavenue.com/transaction/transaction.do?command=initiateTransaction");
    expect(form.fields.access_code).toBe("AVXX");
    const plain = new URLSearchParams(ccDecrypt(form.fields.encRequest, c.workingKey));
    expect(Object.fromEntries(plain)).toMatchObject({ merchant_id: "12345", order_id: "calvy_a1", currency: "INR", amount: "10.00", redirect_url: "https://calvy.io/api/payments/return?order_id=calvy_a1" });
    expect(JSON.stringify(form)).not.toContain(c.workingKey);
  });
  const answer = (o: unknown) => new Response(`status=0&enc_response=${ccEncrypt(JSON.stringify(o), c.workingKey)}&enc_error_code=`);
  it("order state from the status api; a webhook never verifies", async () => {
    const paid = createCCAvenueProvider(c, asFetch(vi.fn(async () => answer({ Order_Status_Result: { order_status: "Successful", reference_no: "R1" } }))));
    expect(await paid.getOrderState("calvy_a1")).toBe("PAID");
    expect(await createCCAvenueProvider(c, asFetch(vi.fn(async () => answer({ order_status: "Aborted" })))).getOrderState("calvy_a1")).toBe("TERMINATED");
    expect(await createCCAvenueProvider(c, asFetch(vi.fn(async () => answer({ order_status: "Awaited" })))).getOrderState("calvy_a1")).toBe("ACTIVE");
    expect(paid.verifyWebhook("anything", new Headers())).toBeNull();
  });
  it("verify: ok on an answer, a clear message when CCAvenue refuses the details", async () => {
    expect(await createCCAvenueProvider(c, asFetch(vi.fn(async () => answer({ order_status: "" })))).verify!()).toEqual({ ok: true });
    const bad = await createCCAvenueProvider(c, asFetch(vi.fn(async () => new Response("status=1&enc_response=ERROR")))).verify!();
    expect(bad.ok).toBe(false);
    expect(JSON.stringify(bad)).not.toContain(c.workingKey);
  });
});

describe("Paytm PG (India)", () => {
  const c = { mid: "MID123", merchantKey: "abcdefghijklmnop", website: "WEBSTAGING", mode: "TEST" as const };
  it("checksum signs and verifies; a wrong key or edited text fails", () => {
    const sig = paytmSign("hello", c.merchantKey);
    expect(paytmVerify("hello", c.merchantKey, sig)).toBe(true);
    expect(paytmVerify("hello!", c.merchantKey, sig)).toBe(false);
    expect(paytmVerify("hello", "zzzzzzzzzzzzzzzz", sig)).toBe(false);
    expect(paytmVerify("hello", c.merchantKey, "not-base64!!")).toBe(false);
  });
  it("creates the order: signed initiate call, then a POST form with the txn token", async () => {
    const f = vi.fn(async () => json({ body: { resultInfo: { resultStatus: "S" }, txnToken: "TOK" } }));
    const r = await createPaytmProvider(c, asFetch(f)).createOrder(inr);
    expect(r.post).toEqual({ url: "https://securegw-stage.paytm.in/theia/api/v1/showPaymentPage?mid=MID123&orderId=calvy_a1", fields: { mid: "MID123", orderId: "calvy_a1", txnToken: "TOK" } });
    const [url, init] = call(f);
    expect(url).toContain("/theia/api/v1/initiateTransaction?mid=MID123&orderId=calvy_a1");
    const sent = JSON.parse(String(init.body));
    expect(sent.body).toMatchObject({ requestType: "Payment", websiteName: "WEBSTAGING", txnAmount: { value: "10.00", currency: "INR" }, callbackUrl: "https://calvy.io/api/payments/return?order_id=calvy_a1" });
    expect(paytmVerify(JSON.stringify(sent.body), c.merchantKey, sent.head.signature)).toBe(true);
  });
  it("a refused initiate is an error", async () => {
    const f = vi.fn(async () => json({ body: { resultInfo: { resultStatus: "F", resultMsg: "Invalid MID" } } }));
    await expect(createPaytmProvider(c, asFetch(f)).createOrder(inr)).rejects.toThrow(/Invalid MID/);
  });
  const hook = (over: Record<string, string> = {}, key = c.merchantKey) => {
    const f: Record<string, string> = { ORDERID: "calvy_a1", TXNID: "T1", STATUS: "TXN_SUCCESS", TXNAMOUNT: "10.00", PAYMENTMODE: "UPI", ...over };
    return new URLSearchParams({ ...f, CHECKSUMHASH: paytmSign(paytmParamString(f), key) }).toString();
  };
  it("webhook: a correct checksum is accepted; wrong key, tampered amount and no checksum are rejected", () => {
    expect(parsePaytmWebhook(hook(), c.merchantKey)).toEqual({ eventId: "paytm:T1:TXN_SUCCESS", kind: "PAID", providerOrderId: "calvy_a1", amountMinor: 1000, method: "UPI", paymentRef: "T1" });
    expect(parsePaytmWebhook(hook({ STATUS: "TXN_FAILURE" }), c.merchantKey)?.kind).toBe("FAILED");
    expect(parsePaytmWebhook(hook({}, "zzzzzzzzzzzzzzzz"), c.merchantKey)).toBeNull();
    expect(parsePaytmWebhook(hook().replace("TXNAMOUNT=10.00", "TXNAMOUNT=1.00"), c.merchantKey)).toBeNull();
    expect(parsePaytmWebhook("ORDERID=x&STATUS=TXN_SUCCESS", c.merchantKey)).toBeNull();
  });
  it("status and verify use the status api; a bad key is explained, not leaked", async () => {
    const f = vi.fn(async () => json({ body: { resultInfo: { resultStatus: "TXN_SUCCESS" }, txnId: "T1" } }));
    expect(await createPaytmProvider(c, asFetch(f)).getOrderState("calvy_a1")).toBe("PAID");
    const unknownOrder = vi.fn(async () => json({ body: { resultInfo: { resultStatus: "TXN_FAILURE", resultCode: "334" } } }));
    expect(await createPaytmProvider(c, asFetch(unknownOrder)).verify!()).toEqual({ ok: true });
    const badSum = vi.fn(async () => json({ body: { resultInfo: { resultStatus: "TXN_FAILURE", resultCode: "330" } } }));
    const bad = await createPaytmProvider(c, asFetch(badSum)).verify!();
    expect(bad.ok).toBe(false);
    const short = await createPaytmProvider({ ...c, merchantKey: "short" }, asFetch(badSum)).verify!();
    expect(JSON.stringify(short)).toMatch(/16 characters/);
    expect(JSON.stringify([bad, short])).not.toContain(c.merchantKey);
  });
});

describe("shared pieces", () => {
  it("post-return url rewrites the return page to the POST-accepting redirect route", () => {
    expect(postReturnUrl("https://calvy.io/booking/return?order_id={order_id}", "calvy_a1")).toBe("https://calvy.io/api/payments/return?order_id=calvy_a1");
  });
  it("stored gateways build the right adapter for each new provider", () => {
    const row = (provider: string, extra: string | null = null, webhook?: string) => ({ provider, mode: "TEST", ...encryptCredentials({ keyId: "k1", keySecret: "abcdefghijklmnop", webhookSecret: webhook, extra }) });
    expect(providerForGateway(row("PAYU")).name).toBe("PAYU");
    expect(providerForGateway(row("CCAVENUE", "AC")).name).toBe("CCAVENUE");
    expect(providerForGateway(row("PAYTM", "WEBSTAGING")).name).toBe("PAYTM");
    expect(providerForGateway(row("STRIPE", null, "whsec_x")).name).toBe("STRIPE");
    expect(providerForGateway(row("PAYPAL", null, "WH-1")).name).toBe("PAYPAL");
    expect(() => providerForGateway(row("SQUARE"))).toThrow();
  });
  it("Stripe key mode is checked before any call", () => {
    expect(modeMismatch("STRIPE", "TEST", "sk_live_abc")).toMatch(/live key/);
    expect(modeMismatch("STRIPE", "LIVE", "rk_test_abc")).toMatch(/test key/);
    expect(modeMismatch("STRIPE", "TEST", "pk_test_abc")).toMatch(/publishable/);
    expect(modeMismatch("STRIPE", "TEST", "garbage")).toMatch(/sk_ or rk_/);
    expect(modeMismatch("STRIPE", "TEST", "rk_test_abc")).toBeNull();
    expect(modeMismatch("STRIPE", "LIVE", "sk_live_abc")).toBeNull();
  });
});
