import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Route-level tests: Prisma and external services are mocked; we assert input
// validation (400) and tenant isolation (404 for another business's ids).

const session = { current: null as unknown };
const db = vi.hoisted(() => ({
  business: { findUnique: vi.fn(), delete: vi.fn() },
  service: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  staff: { findFirst: vi.fn() },
  appointment: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn() },
  client: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => session.current) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/email", () => ({
  sendBookingConfirmation: vi.fn(),
  sendBookingCancellation: vi.fn(),
  sendBookingReschedule: vi.fn(),
  sendInvoice: vi.fn(),
}));
vi.mock("@/lib/whatsapp", () => ({ sendBookingConfirmationWhatsApp: vi.fn() }));
vi.mock("@/lib/push", () => ({ sendPushToBusiness: vi.fn(async () => {}) }));
vi.mock("@/lib/razorpay", () => ({ razorpay: {} }));
vi.mock("@/lib/ratelimit", () => ({
  rateLimit: Object.assign(vi.fn(async () => ({ ok: true, retryAfter: 0 })), { peek: vi.fn(async () => ({ ok: true, retryAfter: 0 })) }),
  clientIp: () => "1.1.1.1",
}));

import { POST as bookingsPost } from "@/app/api/bookings/route";
import { POST as appointmentsPost } from "@/app/api/appointments/route";
import { PATCH as appointmentPatch } from "@/app/api/appointments/[id]/route";
import { PATCH as servicePatch } from "@/app/api/services/[id]/route";
import { DELETE as tenantDelete } from "@/app/api/admin/tenants/[id]/route";

const json = (body: unknown, method = "POST") =>
  new NextRequest("http://localhost/api/x", {
    method,
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const asUser = (businessId = "biz-A") => (session.current = { user: { id: "u1", businessId, email: "o@a.test" } });

beforeEach(() => {
  vi.clearAllMocks();
  session.current = null;
});

const FUTURE = "2099-01-05";

describe("POST /api/bookings (public)", () => {
  const valid = { businessSlug: "a", serviceId: "s1", date: FUTURE, time: "10:00", clientName: "Jo", clientEmail: " Jo@X.com " };

  it("400 on malformed JSON", async () => {
    const res = await bookingsPost(json("{nope"));
    expect(res.status).toBe(400);
  });
  it.each([
    ["bad email", { clientEmail: "nope" }],
    ["bad time", { time: "25:99" }],
    ["bad date", { date: "tomorrow" }],
    ["no service", { serviceId: undefined }],
    ["oversized notes", { notes: "x".repeat(1001) }],
  ])("400 on %s", async (_n, patch) => {
    const res = await bookingsPost(json({ ...valid, ...patch }));
    expect(res.status).toBe(400);
    expect(db.business.findUnique).not.toHaveBeenCalled();
  });
  it("404 when staffId belongs to another business", async () => {
    db.business.findUnique.mockResolvedValue({ id: "biz-A", services: [], currency: "USD" });
    db.staff.findFirst.mockResolvedValue(null);
    const res = await bookingsPost(json({ ...valid, staffId: "staff-of-B" }));
    expect(res.status).toBe(404);
    expect(db.staff.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "staff-of-B", businessId: "biz-A" } }),
    );
  });
  it("404 when any serviceId is not in the business", async () => {
    db.business.findUnique.mockResolvedValue({ id: "biz-A", services: [{ id: "s1", price: 1, duration: 30, name: "Cut" }] });
    const res = await bookingsPost(json({ ...valid, serviceId: undefined, serviceIds: ["s1", "foreign"] }));
    expect(res.status).toBe(404);
  });
});

describe("POST /api/appointments (dashboard)", () => {
  const valid = { clientName: "Jo", clientEmail: "jo@x.com", serviceId: "s1", date: FUTURE, time: "10:00" };

  it("401 without a session", async () => {
    expect((await appointmentsPost(json(valid))).status).toBe(401);
  });
  it("400 on invalid input", async () => {
    asUser();
    expect((await appointmentsPost(json({ ...valid, time: "9am" }))).status).toBe(400);
    expect((await appointmentsPost(json({ ...valid, clientEmail: "x" }))).status).toBe(400);
    expect(db.business.findUnique).not.toHaveBeenCalled();
  });
  it("404 when a service id belongs to another tenant", async () => {
    asUser();
    db.business.findUnique.mockResolvedValue({ name: "A", plan: "business", planStatus: "active", trialEndsAt: null, currency: "USD" });
    db.service.findMany.mockResolvedValue([]);
    const res = await appointmentsPost(json({ ...valid, serviceId: "svc-of-B" }));
    expect(res.status).toBe(404);
    expect(db.service.findMany).toHaveBeenCalledWith({ where: { id: { in: ["svc-of-B"] }, businessId: "biz-A" } });
  });
});

describe("PATCH /api/appointments/[id]", () => {
  it("400 on an invalid status", async () => {
    asUser();
    db.appointment.findFirst.mockResolvedValue({ id: "a1", status: "confirmed", paymentStatus: "unpaid", date: new Date() });
    const res = await appointmentPatch(json({ status: "exploded" }, "PATCH"), { params: Promise.resolve({ id: "a1" }) });
    expect(res.status).toBe(400);
    expect(db.appointment.update).not.toHaveBeenCalled();
  });
  it("404 for another business's appointment (scoped lookup)", async () => {
    asUser();
    db.appointment.findFirst.mockResolvedValue(null);
    const res = await appointmentPatch(json({ status: "cancelled" }, "PATCH"), { params: Promise.resolve({ id: "appt-of-B" }) });
    expect(res.status).toBe(404);
    expect(db.appointment.findFirst).toHaveBeenCalledWith({ where: { id: "appt-of-B", businessId: "biz-A" } });
    expect(db.appointment.update).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/services/[id]", () => {
  it("404 for another business's service", async () => {
    asUser();
    db.service.findFirst.mockResolvedValue(null);
    const res = await servicePatch(json({ name: "x" }, "PATCH"), { params: Promise.resolve({ id: "svc-of-B" }) });
    expect(res.status).toBe(404);
    expect(db.service.update).not.toHaveBeenCalled();
  });
  it("strips businessId and other non-allow-listed fields (no mass assignment)", async () => {
    asUser();
    db.service.findFirst.mockResolvedValue({ id: "s1", name: "Old" });
    db.service.update.mockResolvedValue({ id: "s1" });
    const res = await servicePatch(json({ price: 20, businessId: "biz-B", id: "other" }, "PATCH"), { params: Promise.resolve({ id: "s1" }) });
    expect(res.status).toBe(200);
    expect(db.service.update).toHaveBeenCalledWith({ where: { id: "s1" }, data: { price: 20 } });
  });
  it("400 on negative price / zero duration", async () => {
    asUser();
    db.service.findFirst.mockResolvedValue({ id: "s1", name: "Old" });
    expect((await servicePatch(json({ price: -1 }, "PATCH"), { params: Promise.resolve({ id: "s1" }) })).status).toBe(400);
    expect((await servicePatch(json({ duration: 0 }, "PATCH"), { params: Promise.resolve({ id: "s1" }) })).status).toBe(400);
  });
});

describe("DELETE /api/admin/tenants/[id]", () => {
  const admin = () => (session.current = { user: { role: "admin", email: "root@calvy.test" } });
  it("403 for non-admins", async () => {
    asUser();
    expect((await tenantDelete(json({ confirm: "a" }, "DELETE"), { params: Promise.resolve({ id: "b1" }) })).status).toBe(403);
  });
  it("400 without or with a wrong confirmation", async () => {
    admin();
    db.business.findUnique.mockResolvedValue({ id: "b1", slug: "acme" });
    expect((await tenantDelete(json({}, "DELETE"), { params: Promise.resolve({ id: "b1" }) })).status).toBe(400);
    expect((await tenantDelete(json({ confirm: "nope" }, "DELETE"), { params: Promise.resolve({ id: "b1" }) })).status).toBe(400);
    expect(db.business.delete).not.toHaveBeenCalled();
  });
  it("deletes when the slug matches", async () => {
    admin();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    db.business.findUnique.mockResolvedValue({ id: "b1", slug: "acme" });
    const res = await tenantDelete(json({ confirm: "acme" }, "DELETE"), { params: Promise.resolve({ id: "b1" }) });
    expect(res.status).toBe(200);
    expect(db.business.delete).toHaveBeenCalledWith({ where: { id: "b1" } });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
