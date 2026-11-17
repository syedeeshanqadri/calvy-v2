import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildInvoicePdf, type InvoicePdfInput } from "@/lib/subscriptions/invoicePdf";
import { subsSignature } from "@/lib/subscriptions/cashfree";

const base: InvoicePdfInput = {
  number: "CALVY/2026-27/0001", kind: "RECEIPT", issuedAt: new Date("2026-11-17T06:00:00Z"), planId: "professional", interval: "MONTHLY",
  periodStart: new Date("2026-11-17T06:00:00Z"), periodEnd: new Date("2026-12-17T06:00:00Z"), grossMinor: 34900, creditMinor: 0, amountMinor: 34900,
  taxableMinor: 34900, gstMinor: 0, gstRate: 0, paymentMethodLabel: "UPI Autopay", customer: { businessName: "Glow Studio", email: "o@x.com" },
  issuer: { legalName: "Raybit Technologies Pvt Ltd", address: "174, Rajbagh, Srinagar", gstin: null, cin: null },
};
/** pdf-lib writes each drawn string as a hex string "<48656c6c6f> Tj" (possibly in a deflated stream): read them back as text. */
import { inflateSync } from "node:zlib";
const text = async (i: InvoicePdfInput) => {
  const raw = Buffer.from(await buildInvoicePdf(i));
  const parts: string[] = [raw.toString("latin1")];
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m: RegExpExecArray | null;
  const latin = raw.toString("latin1");
  while ((m = re.exec(latin))) { try { parts.push(inflateSync(Buffer.from(m[1], "latin1")).toString("latin1")); } catch { /* not deflated */ } }
  const all = parts.join("\n");
  const decoded = [...all.matchAll(/<([0-9a-fA-F]+)>\s*Tj/g)].map((x) => Buffer.from(x[1], "hex").toString("latin1")).join("\n");
  return `${all}\n${decoded}`;
};

describe("invoice PDF", () => {
  it("is a real PDF", async () => {
    const bytes = await buildInvoicePdf(base);
    expect(Buffer.from(bytes).subarray(0, 5).toString()).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(1000);
  });
  it("without a GSTIN it says Receipt, shows no GST line and no 'Tax invoice' title", async () => {
    const t = await text(base);
    expect(t).toContain("Receipt");
    expect(t).toContain("This is a receipt, not a tax invoice.");
    expect(t).not.toMatch(/Tax invoice/);
    expect(t).not.toMatch(/GST @/);
    expect(t).toContain("CALVY/2026-27/0001");
    expect(t).toContain("Raybit Technologies Pvt Ltd");
  });
  it("with a GSTIN it is a Tax invoice with the issuer GSTIN, taxable value and the GST line", async () => {
    const t = await text({ ...base, kind: "TAX_INVOICE", taxableMinor: 29576, gstMinor: 5324, gstRate: 18, issuer: { ...base.issuer, gstin: "29ABCDE1234F1Z5" } });
    expect(t).toContain("Tax invoice");
    expect(t).toContain("GSTIN: 29ABCDE1234F1Z5");
    expect(t).toContain("GST @ 18% (included)");
    expect(t).toContain("Taxable value");
  });
  it("shows the proration credit as its own line", async () => {
    const t = await text({ ...base, grossMinor: 79900, creditMinor: 17450, amountMinor: 62450 });
    expect(t).toContain("Credit for the unused part of your previous plan");
    expect(t).toContain("174.50");
  });
  it("a business name in another script never crashes the PDF", async () => {
    await expect(buildInvoicePdf({ ...base, customer: { businessName: "ग्लो स्टूडियो ✂", email: null } })).resolves.toBeInstanceOf(Uint8Array);
  });
});

const mem = vi.hoisted(() => ({ events: new Set<string>(), calls: [] as string[] }));
vi.mock("@/lib/prisma", () => ({ prisma: { webhookEvent: { create: async ({ data }: any) => { if (mem.events.has(data.eventId)) { const { Prisma } = await import("@prisma/client"); throw new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x" }); } mem.events.add(data.eventId); } } } }));
vi.mock("@/lib/subscriptions/service", () => ({
  onAuthorised: vi.fn(async () => { mem.calls.push("authorised"); return "activated"; }),
  onAuthFailed: vi.fn(async () => { mem.calls.push("auth_failed"); }),
  onChargeSucceeded: vi.fn(async () => { mem.calls.push("charge_ok"); return "renewed"; }),
  onChargeFailed: vi.fn(async () => { mem.calls.push("charge_failed"); return "past_due"; }),
  onMandateEnded: vi.fn(async () => { mem.calls.push("ended"); }),
}));

describe("subscription webhook route", () => {
  beforeEach(() => { mem.events.clear(); mem.calls = []; process.env.CASHFREE_SECRET_KEY = "sec"; delete process.env.CASHFREE_SUBS_WEBHOOK_SECRET; });
  const post = async (type: string, data: object, secret = "sec", ts = String(Math.floor(Date.now() / 1000))) => {
    const { POST } = await import("@/app/api/subscriptions/webhook/route");
    const raw = JSON.stringify({ type, data });
    return POST(new Request("http://x/api/subscriptions/webhook", { method: "POST", body: raw, headers: { "x-webhook-signature": subsSignature(ts, raw, secret), "x-webhook-timestamp": ts } }) as never);
  };
  it("a wrong signature is 401 and changes nothing", async () => {
    expect((await post("SUBSCRIPTION_PAYMENT_FAILED", { subscription_id: "s", payment_id: "p" }, "wrong")).status).toBe(401);
    expect(mem.calls).toEqual([]);
  });
  it("a verified event is applied once; a redelivery is a no-op 200", async () => {
    const data = { subscription_id: "s", payment_id: "calvy_ch_1_x", payment_amount: 349, payment_status: "SUCCESS" };
    expect((await post("SUBSCRIPTION_PAYMENT_SUCCESS", data)).status).toBe(200);
    const again = await post("SUBSCRIPTION_PAYMENT_SUCCESS", data);
    expect((await again.json()).result).toBe("duplicate");
    expect(mem.calls).toEqual(["charge_ok"]);
  });
  it("routes every event kind to its handler", async () => {
    await post("SUBSCRIPTION_AUTH_STATUS", { subscription_id: "s", payment_id: "a", authorization_details: { authorization_status: "ACTIVE" } });
    await post("SUBSCRIPTION_AUTH_STATUS", { subscription_id: "s2", authorization_details: { authorization_status: "FAILED" } });
    await post("SUBSCRIPTION_PAYMENT_FAILED", { subscription_id: "s3", payment_id: "f" });
    await post("SUBSCRIPTION_STATUS_CHANGED", { subscription_details: { subscription_id: "s4", subscription_status: "CUSTOMER_CANCELLED" } });
    expect(mem.calls).toEqual(["authorised", "auth_failed", "charge_failed", "ended"]);
  });
  it("without any secret configured it refuses (fail closed)", async () => {
    delete process.env.CASHFREE_SECRET_KEY;
    expect((await post("SUBSCRIPTION_PAYMENT_FAILED", { subscription_id: "s", payment_id: "p" })).status).toBe(503);
  });
});
