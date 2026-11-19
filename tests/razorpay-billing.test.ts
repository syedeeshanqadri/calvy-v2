import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// International plan billing through Razorpay: config guards, signatures, the Razorpay API payloads, region routing, the invoice tax lines.
// (The subscription state machine, idempotency and dunning are in razorpay-service.test.ts.)

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

import {
  RazorpayApiError, isRecurringUnsupported, makeRazorpayClient, parseRazorpayEvent, razorpayConfig, verifyCheckoutSignature, verifyWebhookSignature,
} from "@/lib/subscriptions/razorpay";
import { billingGateway, razorpayAllowedFor } from "@/lib/subscriptions/razorpayService";
import { intlPlanAmountMinor, invoiceLines, planPriceFor, taxKindFor, dunningDue, RZP_DUNNING_DAYS, DUNNING_DAYS, graceEnd, GRACE_DAYS } from "@/lib/subscriptions/rules";
import { invoiceIssuer } from "@/lib/subscriptions/service";
import { buildInvoicePdf, type InvoicePdfInput } from "@/lib/subscriptions/invoicePdf";
import { inflateSync } from "node:zlib";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const sign = (body: string, secret: string) => createHmac("sha256", secret).update(body).digest("hex");

describe("env and the live-key rule (names only, values never exposed)", () => {
  const env = (o: Record<string, string>): NodeJS.ProcessEnv => ({ NODE_ENV: "development", ...o }) as NodeJS.ProcessEnv;
  it("needs both keys", () => {
    expect(razorpayConfig(env({}))).toEqual({ ok: false, reason: "missing" });
    expect(razorpayConfig(env({ RAZORPAY_KEY_ID: "rzp_test_abc" }))).toEqual({ ok: false, reason: "missing" });
  });
  it("a test key works anywhere", () => {
    const r = razorpayConfig(env({ RAZORPAY_KEY_ID: "rzp_test_abc", RAZORPAY_KEY_SECRET: "s", RAZORPAY_WEBHOOK_SECRET: "w" }));
    expect(r.ok && r.config).toMatchObject({ live: false, webhookSecret: "w" });
    expect(razorpayConfig(env({ RAZORPAY_KEY_ID: "rzp_test_abc", RAZORPAY_KEY_SECRET: "s", NODE_ENV: "production" })).ok).toBe(true);
  });
  it("a LIVE key is refused outside production", () => {
    for (const nodeEnv of ["development", "test", ""]) {
      expect(razorpayConfig(env({ RAZORPAY_KEY_ID: "rzp_live_abc", RAZORPAY_KEY_SECRET: "s", NODE_ENV: nodeEnv }))).toEqual({ ok: false, reason: "live_key_outside_production" });
    }
  });
  it("a live key is accepted in production", () => {
    const r = razorpayConfig(env({ RAZORPAY_KEY_ID: "rzp_live_abc", RAZORPAY_KEY_SECRET: "s", NODE_ENV: "production" }));
    expect(r.ok && r.config.live).toBe(true);
  });
  it("the refusal never contains the key", () => {
    const r = razorpayConfig(env({ RAZORPAY_KEY_ID: "rzp_live_SECRETVALUE", RAZORPAY_KEY_SECRET: "topsecret" }));
    expect(JSON.stringify(r)).not.toMatch(/SECRETVALUE|topsecret/);
  });
  it("no source file prints or logs the secrets", () => {
    for (const f of ["lib/subscriptions/razorpay.ts", "lib/subscriptions/razorpayService.ts", "app/api/billing/razorpay/webhook/route.ts"]) {
      expect(read(f)).not.toMatch(/(logger|console)\.\w+\([^)]*(keySecret|webhookSecret|RAZORPAY_KEY_SECRET|RAZORPAY_WEBHOOK_SECRET)/);
    }
  });
});

describe("webhook signature", () => {
  const body = JSON.stringify({ event: "subscription.charged", payload: {} });
  it("a correct HMAC-SHA256 of the raw body verifies", () => expect(verifyWebhookSignature(body, sign(body, "whsec"), "whsec")).toBe(true));
  it("a wrong secret, a tampered body, a missing header or a missing secret never verifies", () => {
    expect(verifyWebhookSignature(body, sign(body, "other"), "whsec")).toBe(false);
    expect(verifyWebhookSignature(body + " ", sign(body, "whsec"), "whsec")).toBe(false);
    expect(verifyWebhookSignature(body, null, "whsec")).toBe(false);
    expect(verifyWebhookSignature(body, "", "whsec")).toBe(false);
    expect(verifyWebhookSignature(body, sign(body, "whsec"), null)).toBe(false);
    expect(verifyWebhookSignature(body, sign(body, ""), "")).toBe(false);
  });
  it("a short or non-hex signature is refused without throwing (constant-time compare needs equal lengths)", () => {
    expect(verifyWebhookSignature(body, "abc", "whsec")).toBe(false);
    expect(verifyWebhookSignature(body, "z".repeat(64), "whsec")).toBe(false);
  });
  it("uses the RAW body: re-serialised JSON does not verify", () => {
    const pretty = JSON.stringify(JSON.parse(body), null, 2);
    expect(verifyWebhookSignature(pretty, sign(body, "whsec"), "whsec")).toBe(false);
  });
  it("is case-insensitive about the hex digits Razorpay sends", () => expect(verifyWebhookSignature(body, sign(body, "whsec").toUpperCase(), "whsec")).toBe(true));
  it("the checkout confirmation uses payment_id|subscription_id with the KEY secret", () => {
    const sig = createHmac("sha256", "keysecret").update("pay_1|sub_1").digest("hex");
    expect(verifyCheckoutSignature("pay_1", "sub_1", sig, "keysecret")).toBe(true);
    expect(verifyCheckoutSignature("pay_2", "sub_1", sig, "keysecret")).toBe(false);
    expect(verifyCheckoutSignature("pay_1", "sub_2", sig, "keysecret")).toBe(false);
    expect(verifyCheckoutSignature("pay_1", "sub_1", sig, "other")).toBe(false);
    expect(verifyCheckoutSignature("pay_1", "sub_1", null, "keysecret")).toBe(false);
  });
  it("the route checks the signature before reading or applying anything", () => {
    const src = read("app/api/billing/razorpay/webhook/route.ts");
    const at = src.indexOf("verifyWebhookSignature(rawBody");
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(src.indexOf("parseRazorpayEvent(rawBody"));
    expect(at).toBeLessThan(src.indexOf("webhookEvent.create"));
    expect(src).toContain("rawBody = await req.text()");
    expect(src).toContain("status: 401");
  });
});

describe("webhook events are normalised", () => {
  const ev = (event: string, payload: object) => JSON.stringify({ event, payload });
  it("subscription.charged carries the payment", () => {
    const e = parseRazorpayEvent(ev("subscription.charged", { subscription: { entity: { id: "sub_1" } }, payment: { entity: { id: "pay_1", amount: 500, currency: "usd", status: "captured", method: "card" } } }));
    expect(e).toMatchObject({ kind: "CHARGED", subscriptionId: "sub_1", payment: { id: "pay_1", amountMinor: 500, currency: "USD", status: "captured", method: "card" } });
  });
  it("maps the four events to their kinds", () => {
    const kinds = ["activated", "halted", "cancelled", "authenticated"].map((n) => parseRazorpayEvent(ev(`subscription.${n}`, { subscription: { entity: { id: "s" } } }))?.kind);
    expect(kinds).toEqual(["ACTIVATED", "HALTED", "CANCELLED", "AUTHENTICATED"]);
  });
  it("a payment link event carries its notes", () => {
    const e = parseRazorpayEvent(ev("payment_link.paid", { payment_link: { entity: { id: "plink_1", notes: { calvySubscription: "rzp:x" } } }, payment: { entity: { id: "pay_9", amount: 100, currency: "USD", status: "captured" } } }));
    expect(e).toMatchObject({ kind: "LINK_PAID", link: { id: "plink_1", notes: { calvySubscription: "rzp:x" } }, payment: { id: "pay_9" } });
  });
  it("unknown or malformed bodies are harmless", () => {
    expect(parseRazorpayEvent("not json")).toBeNull();
    expect(parseRazorpayEvent("{}")).toBeNull();
    expect(parseRazorpayEvent(ev("order.paid", {}))?.kind).toBe("OTHER");
  });
});

describe("the Razorpay API calls", () => {
  const cfg = { keyId: "rzp_test_k", keySecret: "s", webhookSecret: "w", live: false };
  function fakeFetch(handler: (url: string, init: RequestInit) => { status?: number; body: unknown }) {
    const calls: { url: string; init: RequestInit; json: any }[] = [];
    const f = (async (url: string, init: RequestInit) => {
      const r = handler(url, init);
      calls.push({ url, init, json: init.body ? JSON.parse(String(init.body)) : null });
      return { ok: (r.status ?? 200) < 400, status: r.status ?? 200, statusText: "x", json: async () => r.body };
    }) as unknown as typeof fetch;
    return { f, calls };
  }
  it("authenticates with the key pair and never sends the webhook secret", async () => {
    const { f, calls } = fakeFetch(() => ({ body: { id: "plan_1" } }));
    await makeRazorpayClient(cfg, f).createPlan({ period: "monthly", name: "Calvy Pro monthly", amountMinor: 500 });
    expect(calls[0].url).toBe("https://api.razorpay.com/v1/plans");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from("rzp_test_k:s").toString("base64")}`);
    expect(JSON.stringify(calls[0])).not.toContain("\"w\"");
  });
  it("plans are always in dollars", async () => {
    const { f, calls } = fakeFetch(() => ({ body: { id: "plan_1" } }));
    await makeRazorpayClient(cfg, f).createPlan({ period: "yearly", name: "n", amountMinor: 6000 });
    expect(calls[0].json).toEqual({ period: "yearly", interval: 1, item: { name: "n", amount: 6000, currency: "USD" } });
  });
  it("with no discount the subscription starts at once, with no start_at and no add-on", async () => {
    const { f, calls } = fakeFetch(() => ({ body: { id: "sub_1", status: "created", short_url: "https://rzp.io/x" } }));
    await makeRazorpayClient(cfg, f).createSubscription({ planId: "plan_1", totalCount: 120, notes: { a: "b" } });
    expect(calls[0].json).toMatchObject({ plan_id: "plan_1", total_count: 120, quantity: 1 });
    expect(calls[0].json).not.toHaveProperty("start_at");
    expect(calls[0].json).not.toHaveProperty("addons");
  });
  it("a first-period discount is ONE checkout: a future start_at plus an add-on of the discounted amount", async () => {
    const { f, calls } = fakeFetch(() => ({ body: { id: "sub_1", status: "created" } }));
    await makeRazorpayClient(cfg, f).createSubscription({ planId: "plan_1", totalCount: 120, startAt: 1_800_000_000, addons: [{ item: { name: "first month", amount: 400, currency: "USD" } }], notes: {} });
    expect(calls[0].json.start_at).toBe(1_800_000_000);
    expect(calls[0].json.addons).toEqual([{ item: { name: "first month", amount: 400, currency: "USD" } }]);
  });
  it("cancel at cycle end and the scheduled plan change use the documented fields", async () => {
    const { f, calls } = fakeFetch(() => ({ body: {} }));
    const c = makeRazorpayClient(cfg, f);
    await c.cancelSubscription("sub_1", true);
    await c.cancelSubscription("sub_1", false);
    await c.updateSubscriptionPlan("sub_1", "plan_2");
    expect(calls[0].json).toEqual({ cancel_at_cycle_end: 1 });
    expect(calls[1].json).toEqual({ cancel_at_cycle_end: 0 });
    expect(calls[2].init.method).toBe("PATCH");
    expect(calls[2].json).toEqual({ plan_id: "plan_2", schedule_change_at: "cycle_end" });
  });
  it("a payment link is in dollars and carries the notes that tie it to the subscription", async () => {
    const { f, calls } = fakeFetch(() => ({ body: { id: "plink_1", short_url: "https://rzp.io/l/x", status: "created" } }));
    const l = await makeRazorpayClient(cfg, f).createPaymentLink({ amountMinor: 500, description: "Calvy", referenceId: "ref1", customer: { name: "A", email: "a@x.com" }, notes: { calvySubscription: "rzp:1" } });
    expect(l).toEqual({ id: "plink_1", shortUrl: "https://rzp.io/l/x", status: "created" });
    expect(calls[0].json).toMatchObject({ amount: 500, currency: "USD", notes: { calvySubscription: "rzp:1" } });
  });
  it("API errors carry the code and description", async () => {
    const { f } = fakeFetch(() => ({ status: 400, body: { error: { code: "BAD_REQUEST_ERROR", description: "International currency not enabled for recurring" } } }));
    await expect(makeRazorpayClient(cfg, f).createSubscription({ planId: "p", totalCount: 1, notes: {} })).rejects.toMatchObject({ status: 400, code: "BAD_REQUEST_ERROR" });
  });
  it("only a 400 about currency or recurring triggers the fallback; other failures do not silently change how someone is billed", () => {
    expect(isRecurringUnsupported(new RazorpayApiError(400, "BAD_REQUEST_ERROR", "International currency is not enabled for subscriptions"))).toBe(true);
    expect(isRecurringUnsupported(new RazorpayApiError(400, "BAD_REQUEST_ERROR", "Recurring payments are not supported for this card"))).toBe(true);
    expect(isRecurringUnsupported(new RazorpayApiError(400, "BAD_REQUEST_ERROR", "The id provided does not exist"))).toBe(false);
    expect(isRecurringUnsupported(new RazorpayApiError(500, null, "currency recurring"))).toBe(false);
    expect(isRecurringUnsupported(new RazorpayApiError(401, "BAD_REQUEST_ERROR", "Authentication failed"))).toBe(false);
    expect(isRecurringUnsupported(new Error("currency"))).toBe(false);
  });
});

describe("region guard: India is Cashfree, everyone else is Razorpay, and Razorpay refuses INR", () => {
  it("routes by region", () => {
    expect(billingGateway({ currency: "INR" })).toBe("CASHFREE");
    expect(billingGateway({ currency: "USD" })).toBe("RAZORPAY");
    expect(billingGateway({ currency: "GBP" })).toBe("RAZORPAY");
    expect(billingGateway({})).toBe("RAZORPAY");
  });
  it("a stored country wins over the currency (the same rule the price list uses)", () => {
    expect(billingGateway({ country: "IN", currency: "USD" })).toBe("CASHFREE");
    expect(billingGateway({ country: "US", currency: "INR" })).toBe("RAZORPAY");
  });
  it("Razorpay is refused for India and for rupees", () => {
    expect(razorpayAllowedFor({ currency: "INR" })).toMatchObject({ ok: false });
    expect(razorpayAllowedFor({ country: "IN", currency: "USD" })).toMatchObject({ ok: false });
    expect(razorpayAllowedFor({ country: "US", currency: "INR" })).toMatchObject({ ok: false });
    expect(razorpayAllowedFor({ country: "US", currency: "USD" })).toEqual({ ok: true });
  });
  it("prices come from each region's own list: rupees via Cashfree, dollars via Razorpay", () => {
    expect(planPriceFor("CASHFREE", "professional", "MONTHLY")).toBe(34900);
    expect(planPriceFor("RAZORPAY", "professional", "MONTHLY")).toBe(600);
    expect(planPriceFor("RAZORPAY", "business", "YEARLY")).toBe(14400);
    expect(intlPlanAmountMinor("professional", "YEARLY")).toBe(6000);
  });
  it("the checkout and quote routes pick the gateway by region and the India path is never reached for a dollar business", () => {
    const checkout = read("app/api/subscriptions/checkout/route.ts");
    expect(checkout).toContain("billingGateway(business) === \"RAZORPAY\"");
    expect(checkout.indexOf("startIntlCheckout")).toBeLessThan(checkout.indexOf("startCheckout({ businessId"));
    expect(read("app/api/subscriptions/quote/route.ts")).toContain("razorpayAllowedFor(b)");
  });
  it("the Razorpay money handlers only ever touch Razorpay-billed rows", () => {
    const src = read("lib/subscriptions/razorpayService.ts");
    expect(src).toMatch(/found\.gateway !== "RAZORPAY"/);
    expect(src).toContain("payment.currency !== RAZORPAY_BILLING_CURRENCY");
    // and the Cashfree cron no longer picks up Razorpay rows
    const cf = read("lib/subscriptions/service.ts");
    expect(cf).toContain('where: { gateway: "CASHFREE", state: { in: ["ACTIVE", "AUTHORISED"] }');
    expect(cf).toContain('where: { gateway: "CASHFREE", state: "PAST_DUE" }');
  });
  it("Razorpay's billing code never imports the business-own gateway adapters (lib/payments is untouched)", () => {
    for (const f of ["lib/subscriptions/razorpay.ts", "lib/subscriptions/razorpayService.ts"]) expect(read(f)).not.toMatch(/from "@\/lib\/payments\/(razorpay|index|provider|gateways|cashfree)/);
    expect(fs.existsSync(path.join(process.cwd(), "app/api/payments/razorpay"))).toBe(false);
  });
});

describe("tax lines: decided by region and the LUT, never by currency", () => {
  const base = { grossMinor: 500, creditMinor: 0, gstRatePercent: 18 };
  it("receipt-only mode while there is no GSTIN, whatever the currency", () => {
    for (const taxKind of ["GST", "IGST", "LUT"] as const) expect(invoiceLines({ ...base, gstin: null, taxKind })).toMatchObject({ kind: "RECEIPT", gstMinor: 0, taxableMinor: 500 });
  });
  it("a dollar invoice with a GSTIN and no LUT carries IGST at the configured rate, shown on the invoice", () => {
    const l = invoiceLines({ ...base, gstin: "29ABCDE1234F1Z5", taxKind: "IGST" });
    expect(l).toMatchObject({ kind: "TAX_INVOICE", taxKind: "IGST", amountMinor: 500, gstRate: 18 });
    expect(l.gstMinor).toBeGreaterThan(0);
    expect(l.taxableMinor + l.gstMinor).toBe(500);
  });
  it("with an LUT the tax line is dropped (zero-rated export)", () => {
    const l = invoiceLines({ ...base, gstin: "29ABCDE1234F1Z5", taxKind: "LUT" });
    expect(l).toMatchObject({ kind: "TAX_INVOICE", taxKind: "LUT", gstMinor: 0, taxableMinor: 500, gstRate: 0 });
  });
  it("India stays GST", () => expect(invoiceLines({ ...base, grossMinor: 34900, gstin: "29ABCDE1234F1Z5" })).toMatchObject({ taxKind: "GST", gstRate: 18 }));
  it("taxKindFor: Cashfree is GST; Razorpay is LUT when the number is set, IGST otherwise", () => {
    expect(taxKindFor("CASHFREE", "LUT123")).toBe("GST");
    expect(taxKindFor("CASHFREE", null)).toBe("GST");
    expect(taxKindFor("RAZORPAY", null)).toBe("IGST");
    expect(taxKindFor("RAZORPAY", "AD290000000001")).toBe("LUT");
  });
  it("CALVY_LUT_NUMBER is read from the environment and is empty by default", () => {
    expect(invoiceIssuer({} as NodeJS.ProcessEnv).lutNumber).toBeNull();
    expect(invoiceIssuer({ CALVY_LUT_NUMBER: " AD290000000001 " } as unknown as NodeJS.ProcessEnv).lutNumber).toBe("AD290000000001");
    expect(invoiceIssuer({ CALVY_GST_RATE: "12" } as unknown as NodeJS.ProcessEnv).gstRatePercent).toBe(12);
  });

  const pdfBase: InvoicePdfInput = {
    number: "CALVY/2026-27/0007", kind: "TAX_INVOICE", issuedAt: new Date("2026-11-17T06:00:00Z"), planId: "professional", interval: "MONTHLY",
    periodStart: new Date("2026-11-17T06:00:00Z"), periodEnd: new Date("2026-12-17T06:00:00Z"), grossMinor: 500, creditMinor: 0, amountMinor: 500, taxableMinor: 424, gstMinor: 76, gstRate: 18,
    paymentMethodLabel: "Card", customer: { businessName: "Glow Studio", email: "o@x.com" }, issuer: { legalName: "Raybit Technologies Pvt Ltd", address: "Srinagar", gstin: "29ABCDE1234F1Z5", cin: null },
    currency: "USD", taxKind: "IGST",
  };
  const text = async (i: InvoicePdfInput) => {
    const raw = Buffer.from(await buildInvoicePdf(i));
    const latin = raw.toString("latin1");
    const parts = [latin];
    const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(latin))) { try { parts.push(inflateSync(Buffer.from(m[1], "latin1")).toString("latin1")); } catch { /* not deflated */ } }
    const all = parts.join("\n");
    return `${all}\n${[...all.matchAll(/<([0-9a-fA-F]+)>\s*Tj/g)].map((x) => Buffer.from(x[1], "hex").toString("latin1")).join("\n")}`;
  };
  it("a dollar invoice shows dollars and an IGST line", async () => {
    const t = await text(pdfBase);
    expect(t).toContain("$5.00");
    expect(t).toContain("IGST @ 18% (included)");
    expect(t).toContain("Amounts include IGST.");
    expect(t).not.toContain("Rs "); // dollars, not rupees
  });
  it("under an LUT it carries no tax line and prints the LUT number", async () => {
    const t = await text({ ...pdfBase, taxKind: "LUT", lutNumber: "AD290000000001", taxableMinor: 500, gstMinor: 0, gstRate: 0 });
    expect(t).not.toContain("IGST @");
    expect(t).not.toContain("Taxable value");
    expect(t).toContain("export under Letter of Undertaking AD290000000001");
  });
  it("a receipt (no GSTIN) in dollars has no tax line", async () => {
    const t = await text({ ...pdfBase, kind: "RECEIPT", issuer: { ...pdfBase.issuer, gstin: null }, taxableMinor: 500, gstMinor: 0, gstRate: 0 });
    expect(t).toContain("This is a receipt, not a tax invoice.");
    expect(t).not.toContain("IGST @");
  });
});

describe("dunning for Razorpay: halted = past due, 7 days of grace, reminders on days 1, 3 and 6", () => {
  const first = new Date("2026-11-20T00:00:00Z");
  const at = (d: number) => new Date(first.getTime() + d * 86_400_000);
  it("the schedule", () => {
    expect(GRACE_DAYS).toBe(7);
    expect([...RZP_DUNNING_DAYS]).toEqual([1, 3, 6]);
    expect([...DUNNING_DAYS]).toEqual([0, 3, 6]); // India's is unchanged
    expect(graceEnd(first).toISOString()).toBe("2026-11-27T00:00:00.000Z");
  });
  it("nothing on day 0, then email 1 on day 1, 2 on day 3, 3 on day 6, never twice", () => {
    const due = (sent: number, d: number) => dunningDue({ firstFailedAt: first, dunningSent: sent, lastChargeRetryAt: null, now: at(d) }, RZP_DUNNING_DAYS);
    expect(due(0, 0.5)).toBeNull();
    expect(due(0, 1)).toBe(1);
    expect(due(1, 2)).toBeNull();
    expect(due(1, 3)).toBe(2);
    expect(due(2, 5.9)).toBeNull();
    expect(due(2, 6)).toBe(3);
    expect(due(3, 7)).toBeNull();
  });
});
