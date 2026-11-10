import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Online payment settings (owner only), the worked examples, the GST receipt for Calvy's booking fee, and the go-live health check.

const db = vi.hoisted(() => ({
  business: { update: vi.fn() },
  auditLog: { create: vi.fn() },
  teamMember: { findUnique: vi.fn() },
  webhookEvent: { findFirst: vi.fn() },
  payment: { findFirst: vi.fn() },
  appointment: { count: vi.fn() },
}));
const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => session.current) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
const adminGate = vi.hoisted(() => ({ result: null as unknown }));
vi.mock("@/lib/admin/auth", () => ({ requireAdminApi: vi.fn(async () => adminGate.result) }));

import { payExample, paymentSettingsSchema } from "@/lib/paymentSettings";
import { gstSplit, receiptTax } from "@/lib/receiptTax";
import { PATCH as saveSettings } from "@/app/api/settings/payments/route";
import { GET as health } from "@/app/api/admin/payments-health/route";

const patch = (body: unknown) => saveSettings(new NextRequest("http://localhost/api/settings/payments", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
const owner = { user: { id: "u1", businessId: "b1" }, expires: "" };
beforeEach(() => { vi.clearAllMocks(); session.current = owner; db.business.update.mockResolvedValue({ onlinePayMode: "BOOKING_FEE_ONLY", feePayer: "CUSTOMER" }); });

describe("payment settings", () => {
  it("accepts booking-fee-only and a fee payer, and refuses full online while payouts do not exist", () => {
    expect(paymentSettingsSchema.safeParse({ onlinePayMode: "BOOKING_FEE_ONLY", feePayer: "BUSINESS" }).success).toBe(true);
    expect(paymentSettingsSchema.safeParse({ feePayer: "CUSTOMER" }).success).toBe(true);
    expect(paymentSettingsSchema.safeParse({ onlinePayMode: "FULL_ONLINE" }).success).toBe(false);
    expect(paymentSettingsSchema.safeParse({}).success).toBe(false);
    expect(paymentSettingsSchema.safeParse({ feePayer: "SOMEONE" }).success).toBe(false);
  });
  it("the owner can save; the change is audited", async () => {
    expect((await patch({ onlinePayMode: "BOOKING_FEE_ONLY", feePayer: "BUSINESS" })).status).toBe(200);
    expect(db.business.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "b1" }, data: { onlinePayMode: "BOOKING_FEE_ONLY", feePayer: "BUSINESS" } }));
    expect(db.auditLog.create).toHaveBeenCalled();
  });
  it("full online is refused by the route too, and nothing is written", async () => {
    expect((await patch({ onlinePayMode: "FULL_ONLINE" })).status).toBe(400);
    expect(db.business.update).not.toHaveBeenCalled();
  });
  it("a guest gets 401 and a team member is refused: payment settings are never a team permission", async () => {
    session.current = null;
    expect((await patch({ feePayer: "BUSINESS" })).status).toBe(401);
    session.current = { user: { id: "u2", name: "Rita", email: "r@x.co" }, expires: "" };
    db.teamMember.findUnique.mockResolvedValue({ id: "m1", businessId: "b1", userId: "u2", roleName: "Manager", permissions: ["services.manage", "reports.view", "customers.export"], staffId: null });
    expect((await patch({ feePayer: "BUSINESS" })).status).toBe(403);
    expect(db.business.update).not.toHaveBeenCalled();
  });
});

describe("worked examples on the screen", () => {
  it("India Free (fee 10): customer pays 510 and the business gets 500, or the business absorbs it: 500 and 490", () => {
    expect(payExample({ mode: "FULL_ONLINE", payer: "CUSTOMER", feeMinorIN: 1000, priceMinor: 50_000 })).toEqual({ customerPaysMinor: 51_000, businessGetsMinor: 50_000, calvyFeeMinor: 1000 });
    expect(payExample({ mode: "FULL_ONLINE", payer: "BUSINESS", feeMinorIN: 1000, priceMinor: 50_000 })).toEqual({ customerPaysMinor: 50_000, businessGetsMinor: 49_000, calvyFeeMinor: 1000 });
  });
  it("booking fee only: the customer pays just the fee, which Calvy keeps; paid plans have no fee", () => {
    expect(payExample({ mode: "BOOKING_FEE_ONLY", payer: "CUSTOMER", feeMinorIN: 1000, priceMinor: 50_000 })).toEqual({ customerPaysMinor: 1000, businessGetsMinor: 0, calvyFeeMinor: 1000 });
    expect(payExample({ mode: "FULL_ONLINE", payer: "CUSTOMER", feeMinorIN: 0, priceMinor: 50_000 }).customerPaysMinor).toBe(50_000);
  });
});

describe("the receipt for Calvy's booking fee", () => {
  const full = { CALVY_LEGAL_NAME: "Raybit Technologies", CALVY_ADDRESS: "1 Example Road, Mumbai", CALVY_GSTIN: "27ABCDE1234F1Z5" };
  it("splits a GST-inclusive fee so the parts always add up", () => {
    expect(gstSplit(1000, 18)).toEqual({ baseMinor: 847, gstMinor: 153 });
    for (const fee of [1, 99, 1000, 1234, 99_999]) { const s = gstSplit(fee, 18); expect(s.baseMinor + s.gstMinor).toBe(fee); }
    expect(gstSplit(1000, 0)).toEqual({ baseMinor: 1000, gstMinor: 0 });
  });
  it("with the company details and a GSTIN it shows the split and the issuer", () => {
    const r = receiptTax(1000, "INR", full);
    expect(r.issuer).toEqual({ legalName: "Raybit Technologies", address: "1 Example Road, Mumbai", gstin: "27ABCDE1234F1Z5" });
    expect(r.split?.ratePercent).toBe(18);
    expect(r.note).toContain("includes GST at 18%");
  });
  it("without a GSTIN there is no GST line and it says it is not a tax invoice", () => {
    const r = receiptTax(1000, "INR", { ...full, CALVY_GSTIN: "" });
    expect(r.split).toBeNull();
    expect(r.note).toContain("not a tax invoice");
  });
  it("with no company details it says so and invents nothing", () => {
    const r = receiptTax(1000, "INR", {});
    expect(r.issuer).toBeNull();
    expect(r.split).toBeNull();
    expect(r.note).toBe("Receipt details not configured.");
  });
  it("a silly GST rate falls back to 18%", () => {
    expect(receiptTax(1000, "INR", { ...full, CALVY_GST_RATE: "-5" }).split?.ratePercent).toBe(18);
    expect(receiptTax(1000, "INR", { ...full, CALVY_GST_RATE: "12" }).split?.ratePercent).toBe(12);
  });
});

describe("go-live health check", () => {
  beforeEach(() => {
    db.webhookEvent.findFirst.mockResolvedValue(null);
    db.payment.findFirst.mockResolvedValue(null);
    db.appointment.count.mockResolvedValue(0);
  });
  it("only the super admin may read it: everyone else gets the 404 the admin gate returns", async () => {
    adminGate.result = { ok: false, res: new Response(JSON.stringify({ error: "Not found" }), { status: 404 }) };
    expect((await health()).status).toBe(404);
  });
  it("lists what is missing and never returns a key or secret", async () => {
    adminGate.result = { ok: true, ctx: { user: { id: "a1", email: "admin@x.co", name: "A" }, sessionId: "s1", reauthAt: new Date(), viewAs: null } };
    const saved = { ...process.env };
    process.env.CASHFREE_APP_ID = "TESTAPPID123"; process.env.CASHFREE_SECRET_KEY = "cfsk_secret_value_xyz";
    delete process.env.CALVY_LEGAL_NAME; delete process.env.CRON_SECRET;
    try {
      const res = await health();
      const text = JSON.stringify(await res.json());
      expect(res.status).toBe(200);
      expect(text).toContain("CALVY_LEGAL_NAME");
      expect(text).toContain("CRON_SECRET");
      expect(text).not.toContain("TESTAPPID123");
      expect(text).not.toContain("cfsk_secret_value_xyz");
    } finally { process.env = saved; }
  });
});
