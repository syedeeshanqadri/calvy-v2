// IDOR guard (S27): a signed-in owner of business A who sends the id of business B's record gets a 404 and the query
// that found it was filtered by A's businessId, so the record can never be read or changed across tenants.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  session: vi.fn(),
  db: {
    paymentGateway: { findFirst: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn() },
    payment: { findFirst: vi.fn(), updateMany: vi.fn() },
    subscriptionInvoice: { findFirst: vi.fn() },
    appointment: { findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
    service: { findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
    staff: { findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
    expense: { findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
    client: { findFirst: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/access", () => ({ accessSession: h.session, appointmentWhere: () => ({}) }));
vi.mock("next-auth", () => ({ getServerSession: h.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: h.db }));
vi.mock("@/lib/payments/access", () => ({ gatewayPlanBlock: async () => null }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/limits", () => ({ checkLimit: async () => null, denialResponse: vi.fn() }));
vi.mock("@/lib/ratelimit", () => ({ rateLimit: async () => ({ ok: true, retryAfter: 0 }), clientIp: () => "1.1.1.1" }));

const A = "biz-A";
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const json = (body: unknown, method = "PATCH") =>
  new NextRequest("http://localhost/api/x", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("FEATURE_PAYMENTS", "1");
  h.session.mockResolvedValue({ user: { id: "u1", businessId: A }, access: { userId: "u1", businessId: A } });
  for (const m of Object.values(h.db)) if (typeof m === "object") for (const fn of Object.values(m)) (fn as ReturnType<typeof vi.fn>).mockResolvedValue(null);
});

const scopedTo = (call: unknown) => expect((call as { where: Record<string, unknown> }).where).toMatchObject({ businessId: A });

describe("another business's record id is a 404 and the lookup is scoped", () => {
  it("gateway: PATCH, DELETE, verify", async () => {
    const { PATCH, DELETE } = await import("@/app/api/settings/gateways/[id]/route");
    const { POST: verify } = await import("@/app/api/settings/gateways/[id]/verify/route");
    expect((await PATCH(json({ enabled: true }), ctx("gw-B"))).status).toBe(404);
    expect((await DELETE(json({}, "DELETE"), ctx("gw-B"))).status).toBe(404);
    expect((await verify(json({}, "POST"), ctx("gw-B"))).status).toBe(404);
    for (const c of h.db.paymentGateway.findFirst.mock.calls) scopedTo(c[0]);
    expect(h.db.paymentGateway.findFirst).toHaveBeenCalledTimes(3);
    expect(h.db.paymentGateway.update).not.toHaveBeenCalled();
    expect(h.db.paymentGateway.delete).not.toHaveBeenCalled();
  });

  it("payment refund", async () => {
    const { POST } = await import("@/app/api/payments/[id]/refund/route");
    expect((await POST(json({ manual: true }, "POST"), ctx("pay-B"))).status).toBe(404);
    scopedTo(h.db.payment.findFirst.mock.calls[0][0]);
    expect(h.db.payment.updateMany).not.toHaveBeenCalled();
  });

  it("subscription invoice PDF", async () => {
    const { GET } = await import("@/app/api/subscriptions/invoices/[id]/pdf/route");
    expect((await GET(new NextRequest("http://localhost/x"), ctx("inv-B"))).status).toBe(404);
    scopedTo(h.db.subscriptionInvoice.findFirst.mock.calls[0][0]);
  });

  it("appointment (booking): PATCH and DELETE", async () => {
    const { PATCH, DELETE } = await import("@/app/api/appointments/[id]/route");
    expect((await PATCH(json({ status: "cancelled" }), ctx("ap-B"))).status).toBe(404);
    expect((await DELETE(json({}, "DELETE"), ctx("ap-B"))).status).toBe(404);
    for (const c of h.db.appointment.findFirst.mock.calls) scopedTo(c[0]);
    expect(h.db.appointment.update).not.toHaveBeenCalled();
    expect(h.db.appointment.delete).not.toHaveBeenCalled();
  });

  it("service, staff and expense: PATCH and DELETE", async () => {
    const svc = await import("@/app/api/services/[id]/route");
    const stf = await import("@/app/api/staff/[id]/route");
    const exp = await import("@/app/api/expenses/[id]/route");
    expect((await svc.PATCH(json({ price: 1 }), ctx("s-B"))).status).toBe(404);
    expect((await svc.DELETE(json({}, "DELETE"), ctx("s-B"))).status).toBe(404);
    expect((await stf.PATCH(json({ name: "x" }), ctx("st-B"))).status).toBe(404);
    expect((await stf.DELETE(json({}, "DELETE"), ctx("st-B"))).status).toBe(404);
    expect((await exp.PATCH(json({ amount: 1 }), ctx("e-B"))).status).toBe(404);
    expect((await exp.DELETE(json({}, "DELETE"), ctx("e-B"))).status).toBe(404);
    for (const m of [h.db.service, h.db.staff, h.db.expense]) {
      for (const c of m.findFirst.mock.calls) scopedTo(c[0]);
      expect(m.update).not.toHaveBeenCalled();
      expect(m.delete).not.toHaveBeenCalled();
    }
  });
});

describe("no session: 401 on the same routes", () => {
  it("returns 401 without touching the database", async () => {
    h.session.mockResolvedValue(null);
    const { POST } = await import("@/app/api/payments/[id]/refund/route");
    const { GET } = await import("@/app/api/subscriptions/invoices/[id]/pdf/route");
    const { PATCH } = await import("@/app/api/settings/gateways/[id]/route");
    expect((await POST(json({}, "POST"), ctx("p"))).status).toBe(401);
    expect((await GET(new NextRequest("http://localhost/x"), ctx("i"))).status).toBe(401);
    expect((await PATCH(json({ enabled: true }), ctx("g"))).status).toBe(401);
    expect(h.db.payment.findFirst).not.toHaveBeenCalled();
  });
});
