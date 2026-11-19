import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const logs = vi.hoisted(() => [] as { m: string; c: any }[]);
vi.mock("@/lib/logger", () => ({ logger: { error: (m: string, c: any) => logs.push({ m, c }), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/ratelimit", () => ({ rateLimit: vi.fn(async () => ({ ok: true, retryAfter: 0 })), clientIp: () => "1.1.1.1" }));

import { PaymentScriptError, newReference, paymentScriptMessage } from "@/lib/loadPaymentScript";
import { POST } from "@/app/api/client-errors/payment-script/route";

describe("payment page load errors say what went wrong, with a reference", () => {
  it("references look like PAY-XXXXXX and differ", () => {
    const a = newReference(), b = newReference();
    expect(a).toMatch(/^PAY-[A-HJ-KM-NP-Z2-9]{6}$/);
    expect(a).not.toBe(b);
  });
  it("a policy block, a network failure and a gateway that did not start are three different messages, each quoting the reference", () => {
    const blocked = paymentScriptMessage("blocked", "Razorpay", "PAY-AAAAAA");
    const network = paymentScriptMessage("network", "Razorpay", "PAY-AAAAAA");
    const gateway = paymentScriptMessage("not_started", "Razorpay", "PAY-AAAAAA");
    expect(new Set([blocked, network, gateway]).size).toBe(3);
    expect(blocked).toMatch(/blocked .*security setting/);
    expect(network).toMatch(/could not reach/);
    expect(gateway).toMatch(/loaded but could not start/);
    for (const m of [blocked, network, gateway]) expect(m).toContain("PAY-AAAAAA");
    expect(blocked).toContain("Razorpay");
  });
  it("the error carries its kind and reference", () => {
    const e = new PaymentScriptError("blocked", "Cashfree", "PAY-BBBBBB");
    expect(e).toMatchObject({ kind: "blocked", provider: "Cashfree", reference: "PAY-BBBBBB", name: "PaymentScriptError" });
    expect(e.message).toContain("PAY-BBBBBB");
  });
});

describe("POST /api/client-errors/payment-script", () => {
  const post = (body: unknown) => POST(new NextRequest("http://localhost/api/client-errors/payment-script", { method: "POST", headers: { "content-type": "application/json", "user-agent": "TestBrowser" }, body: JSON.stringify(body) }));
  const good = { reference: "PAY-ABC234", kind: "blocked", provider: "Razorpay", host: "checkout.razorpay.com", page: "/dashboard/billing" };
  it("logs the reference, the kind, the gateway host and the page", async () => {
    logs.length = 0;
    expect((await post(good)).status).toBe(200);
    expect(logs).toHaveLength(1);
    expect(logs[0].c).toMatchObject({ reference: "PAY-ABC234", kind: "blocked", host: "checkout.razorpay.com", page: "/dashboard/billing", userAgent: "TestBrowser" });
  });
  it("rejects a bad reference, kind, page length or an empty body, and logs nothing", async () => {
    logs.length = 0;
    for (const bad of [{ ...good, reference: "x" }, { ...good, kind: "boom" }, { ...good, page: "x".repeat(500) }, {}]) {
      expect((await post(bad)).status, JSON.stringify(bad).slice(0, 60)).toBe(400);
    }
    expect(logs).toEqual([]);
  });
  it("unknown extra fields are dropped, never logged", async () => {
    logs.length = 0;
    await post({ ...good, secret: "token-abc" });
    expect(JSON.stringify(logs)).not.toContain("token-abc");
  });
});
