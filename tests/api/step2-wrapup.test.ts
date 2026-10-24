import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// Step 2 wrap-up: owner bookings (phone-or-email, walk-in auto-assign), reschedule
// clash, and every plan limit read from PlanConfig. Prisma is faked; the real
// availability engine, booking lock and limits helper run.

const session = { current: null as unknown };
const db = vi.hoisted(() => {
  const d: Record<string, any> = {
    business: { findUnique: vi.fn() },
    service: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), count: vi.fn() },
    staff: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn(), create: vi.fn() },
    workingHours: { findMany: vi.fn() },
    timeOff: { findMany: vi.fn() },
    appointment: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn() },
    client: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    planConfig: { findUnique: vi.fn() },
    $executeRaw: vi.fn(),
  };
  d.$transaction = vi.fn(async (fn: (tx: unknown) => unknown) => fn(d));
  return d;
});
const email = vi.hoisted(() => ({ sendBookingConfirmation: vi.fn(), sendBookingReschedule: vi.fn(), sendBookingCancellation: vi.fn(), sendInvoice: vi.fn() }));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => session.current) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/email", () => email);
vi.mock("@/lib/push", () => ({ sendPushToBusiness: vi.fn(async () => {}) }));
vi.mock("@/lib/ratelimit", () => ({ rateLimit: vi.fn(async () => ({ ok: true, retryAfter: 0 })), clientIp: () => "1.1.1.1" }));
vi.mock("@/lib/schedule", async (orig) => ({ ...(await orig<typeof import("@/lib/schedule")>()), linkStaffToAllServices: vi.fn(), linkServiceToAllStaff: vi.fn() }));
vi.mock("@vercel/blob", () => ({ put: vi.fn(), list: vi.fn() }));

import { POST as appointmentsPost } from "@/app/api/appointments/route";
import { PATCH as appointmentPatch } from "@/app/api/appointments/[id]/route";
import { GET as exportGet } from "@/app/api/appointments/export/route";
import { POST as staffPost } from "@/app/api/staff/route";
import { POST as servicesPost } from "@/app/api/services/route";
import { POST as uploadPost } from "@/app/api/upload/route";
import { PATCH as servicePatch } from "@/app/api/services/[id]/route";

const json = (body: unknown, method = "POST", url = "http://localhost/api/x") =>
  new NextRequest(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const asUser = () => (session.current = { user: { id: "u1", businessId: "biz", email: "o@a.test" } });

const service = { id: "s1", name: "Cut", duration: 60, price: 50, capacity: 1, isActive: true, bufferBeforeMin: 0, bufferAfterMin: 0, businessId: "biz" };
const staffRow = (id: string) => ({ id, services: [{ serviceId: "s1" }] });
const business = (over: Record<string, unknown> = {}) => ({
  id: "biz", name: "Salon X", currency: "INR", plan: "professional", planStatus: "active", trialEndsAt: null,
  timezone: "Asia/Kolkata", slotInterval: 30, minNoticeMinutes: 60, maxAdvanceDays: 90, ...over,
});
/** A PlanConfig row; missing fields are undefined, which the limits mapper tolerates. */
const planConfig = (over: Record<string, unknown>) => ({ planId: "professional", maxStaff: -1, maxServices: -1, maxMonthlyAppointments: -1, groupBooking: true, csvExport: true, imageUpload: true, ...over });
// 2026-10-20 10:00 IST = 04:30Z
const at = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 20, h - 5, m - 30));
const busy = (staffId: string, h: number, durMin = 60, id = "other") => ({
  id, date: at(h), endAt: new Date(at(h).getTime() + durMin * 60_000), staffId, serviceId: "s1", bufferBeforeMin: 0, bufferAfterMin: 0,
});
const walkIn = { clientName: "Asha", clientPhone: "98765 43210", serviceId: "s1", date: "2026-10-20", time: "10:00" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-14T00:00:00Z"));
  session.current = null;
  db.business.findUnique.mockResolvedValue(business());
  db.service.findMany.mockResolvedValue([service]);
  db.service.findUnique.mockResolvedValue({ capacity: 1 });
  db.service.count.mockResolvedValue(0);
  db.staff.findMany.mockResolvedValue([staffRow("st-a"), staffRow("st-b")]);
  db.staff.findFirst.mockResolvedValue({ id: "st-a", name: "A" });
  db.staff.count.mockResolvedValue(0);
  db.staff.create.mockResolvedValue({ id: "st-new" });
  db.workingHours.findMany.mockResolvedValue([]);
  db.timeOff.findMany.mockResolvedValue([]);
  db.appointment.findMany.mockResolvedValue([]);
  db.appointment.count.mockResolvedValue(0);
  db.appointment.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "appt1", ...data }));
  db.appointment.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "a1", ...data }));
  db.client.findFirst.mockResolvedValue(null);
  db.client.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "c1", ...data }));
  db.planConfig.findUnique.mockResolvedValue(planConfig({}));
  db.$executeRaw.mockResolvedValue(0);
  db.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(db));
});
afterEach(() => vi.useRealTimers());

describe("POST /api/appointments: owner and walk-in bookings", () => {
  it("400 when the client has neither a phone nor an email", async () => {
    asUser();
    const res = await appointmentsPost(json({ ...walkIn, clientPhone: undefined }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/phone number or an email/i);
    expect(db.appointment.create).not.toHaveBeenCalled();
  });

  it("books a phone-only walk-in; the phone is stored as E.164 and no email is sent", async () => {
    asUser();
    const res = await appointmentsPost(json(walkIn));
    expect(res.status).toBe(201);
    expect(db.client.create).toHaveBeenCalledWith({
      data: { businessId: "biz", name: "Asha", email: null, phone: "+919876543210" },
    });
    expect(email.sendBookingConfirmation).not.toHaveBeenCalled();
  });

  it("matches an existing client by normalised phone before email", async () => {
    asUser();
    db.client.findFirst.mockImplementation(async ({ where }: { where: { phone?: string } }) =>
      where.phone === "+919876543210" ? { id: "c-old", email: "asha@x.com", phone: "+919876543210" } : null);
    await appointmentsPost(json({ ...walkIn, clientPhone: "+91-98765-43210", clientEmail: "other@x.com" }));
    expect(db.client.create).not.toHaveBeenCalled();
    expect(db.appointment.create.mock.calls[0][0].data.clientId).toBe("c-old");
  });

  it("with no staff picked, auto-assigns the first free staff member under that member's lock", async () => {
    asUser();
    db.appointment.findMany.mockResolvedValue([busy("st-a", 10)]); // st-a is taken at 10:00
    const res = await appointmentsPost(json(walkIn));
    expect(res.status).toBe(201);
    expect(db.appointment.create.mock.calls[0][0].data.staffId).toBe("st-b");
    expect((await res.json()).staffId).toBe("st-b");
    expect(db.$executeRaw.mock.calls.some((c: unknown[]) => c.slice(1).includes("st-b"))).toBe(true);
  });

  it("409 when the picked staff member is busy (no silent reassignment)", async () => {
    asUser();
    db.appointment.findMany.mockResolvedValue([busy("st-a", 10)]);
    const res = await appointmentsPost(json({ ...walkIn, staffId: "st-a" }));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("SLOT_CONFLICT");
    expect(db.appointment.create).not.toHaveBeenCalled();
  });

  it("409 when every staff member is busy", async () => {
    asUser();
    db.appointment.findMany.mockResolvedValue([busy("st-a", 10), busy("st-b", 10, 60, "o2")]);
    expect((await appointmentsPost(json(walkIn))).status).toBe(409);
  });

  it("allowOverlap needs an explicit staff member when the business has staff", async () => {
    asUser();
    db.appointment.findMany.mockResolvedValue([busy("st-a", 10), busy("st-b", 10, 60, "o2")]);
    db.staff.count.mockResolvedValue(2);
    expect((await appointmentsPost(json({ ...walkIn, allowOverlap: true }))).status).toBe(400);
    expect((await appointmentsPost(json({ ...walkIn, allowOverlap: true, staffId: "st-a" }))).status).toBe(201);
  });
});

describe("PATCH /api/appointments/[id]: reschedule", () => {
  const appt = { id: "a1", businessId: "biz", serviceId: "s1", staffId: "st-a", date: at(10), endAt: at(11), duration: 60, status: "confirmed", paymentStatus: "unpaid" };
  const params = { params: Promise.resolve({ id: "a1" }) };
  beforeEach(() => db.appointment.findFirst.mockResolvedValue(appt));

  it("409 when the new time clashes with another booking for that staff member", async () => {
    asUser();
    db.appointment.findMany.mockResolvedValue([busy("st-a", 14)]);
    const res = await appointmentPatch(json({ date: "2026-10-20", time: "14:00" }, "PATCH"), params);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("SLOT_CONFLICT");
    expect(db.appointment.update).not.toHaveBeenCalled();
    // the appointment never blocks its own slot
    expect(db.appointment.findMany.mock.calls[0][0].where.id).toEqual({ not: "a1" });
  });

  it("409 when the lock re-check finds the slot taken (race)", async () => {
    asUser();
    // free at the pre-check, taken inside the lock
    db.appointment.findMany.mockResolvedValueOnce([]).mockResolvedValue([busy("st-a", 14), busy("st-b", 14, 60, "o2")]);
    const res = await appointmentPatch(json({ date: "2026-10-20", time: "14:00" }, "PATCH"), params);
    expect(res.status).toBe(409);
    expect(db.appointment.update).not.toHaveBeenCalled();
  });

  it("moves to a free time on another staff member and re-checks under the lock", async () => {
    asUser();
    const res = await appointmentPatch(json({ date: "2026-10-20", time: "14:00", staffId: "st-b" }, "PATCH"), params);
    expect(res.status).toBe(200);
    const data = db.appointment.update.mock.calls[0][0].data;
    expect(data.staffId).toBe("st-b");
    expect(data.date).toEqual(at(14));
    expect(data.endAt).toEqual(at(15));
    expect(db.$executeRaw).toHaveBeenCalled();
  });

  it("400 when moving into the past", async () => {
    asUser();
    const res = await appointmentPatch(json({ date: "2026-10-10", time: "10:00" }, "PATCH"), params);
    expect(res.status).toBe(400);
    expect(db.appointment.update).not.toHaveBeenCalled();
  });

  it("404 for a staff member of another business", async () => {
    asUser();
    db.staff.findFirst.mockResolvedValue(null);
    const res = await appointmentPatch(json({ staffId: "foreign" }, "PATCH"), params);
    expect(res.status).toBe(404);
    expect(db.staff.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "foreign", businessId: "biz" } }));
  });

  it("400 when date is sent without time", async () => {
    asUser();
    expect((await appointmentPatch(json({ date: "2026-10-20" }, "PATCH"), params)).status).toBe(400);
  });

  it("400 for a cancelled appointment", async () => {
    asUser();
    db.appointment.findFirst.mockResolvedValue({ ...appt, status: "cancelled" });
    expect((await appointmentPatch(json({ date: "2026-10-20", time: "14:00" }, "PATCH"), params)).status).toBe(400);
  });
});

describe("plan limits come from PlanConfig on every route", () => {
  it("staff: 402 at maxStaff", async () => {
    asUser();
    db.planConfig.findUnique.mockResolvedValue(planConfig({ maxStaff: 2 }));
    db.staff.count.mockResolvedValue(2);
    const res = await staffPost(json({ name: "N", role: "Stylist", email: "n@x.com" }));
    expect(res.status).toBe(402);
    expect((await res.json()).code).toBe("LIMIT_REACHED");
  });

  it("staff: a raised limit in PlanConfig is honoured (not the code default)", async () => {
    asUser();
    db.planConfig.findUnique.mockResolvedValue(planConfig({ maxStaff: 10 }));
    db.staff.count.mockResolvedValue(5); // the code default for this plan is 3
    const res = await staffPost(json({ name: "N", role: "Stylist", email: "n@x.com" }));
    expect(res.status).toBe(201);
  });

  it("services: 402 at maxServices", async () => {
    asUser();
    db.planConfig.findUnique.mockResolvedValue(planConfig({ maxServices: 3 }));
    db.service.count.mockResolvedValue(3);
    db.service.findFirst.mockResolvedValue(null);
    const res = await servicesPost(json({ name: "New", duration: 30, price: 10 }));
    expect(res.status).toBe(402);
  });

  it("group booking: creating a multi-spot service is 402 without the flag", async () => {
    asUser();
    db.planConfig.findUnique.mockResolvedValue(planConfig({ groupBooking: false }));
    db.service.findFirst.mockResolvedValue(null);
    const res = await servicesPost(json({ name: "Class", duration: 60, price: 10, capacity: 8 }));
    expect(res.status).toBe(402);
    expect((await res.json()).code).toBe("FEATURE_LOCKED");
  });

  it("group booking: raising capacity on an existing service is 402 without the flag", async () => {
    asUser();
    db.planConfig.findUnique.mockResolvedValue(planConfig({ groupBooking: false }));
    db.service.findFirst.mockResolvedValue({ id: "s1", name: "Cut", capacity: 1, businessId: "biz" });
    const res = await servicePatch(json({ capacity: 5 }, "PATCH"), { params: Promise.resolve({ id: "s1" }) });
    expect(res.status).toBe(402);
  });

  it("group booking: booking a multi-spot service is 402 without the flag", async () => {
    asUser();
    db.planConfig.findUnique.mockResolvedValue(planConfig({ groupBooking: false }));
    db.service.findMany.mockResolvedValue([{ ...service, capacity: 6 }]);
    const res = await appointmentsPost(json(walkIn));
    expect(res.status).toBe(402);
    expect((await res.json()).code).toBe("FEATURE_LOCKED");
  });

  it("monthly appointments: 402 at the cap for owner-created bookings", async () => {
    asUser();
    db.planConfig.findUnique.mockResolvedValue(planConfig({ maxMonthlyAppointments: 100 }));
    db.appointment.count.mockResolvedValue(100);
    const res = await appointmentsPost(json(walkIn));
    expect(res.status).toBe(402);
    expect((await res.json()).code).toBe("LIMIT_REACHED");
    expect(db.appointment.create).not.toHaveBeenCalled();
  });

  it("monthly appointments: a parallel booking that fills the cap inside the lock is refused", async () => {
    asUser();
    db.planConfig.findUnique.mockResolvedValue(planConfig({ maxMonthlyAppointments: 100 }));
    db.appointment.count.mockResolvedValueOnce(99).mockResolvedValue(100);
    const res = await appointmentsPost(json(walkIn));
    expect(res.status).toBe(402);
    expect(db.appointment.create).not.toHaveBeenCalled();
  });

  it("monthly appointments: an expired plan is refused outright", async () => {
    asUser();
    db.business.findUnique.mockResolvedValue(business({ planStatus: "expired" }));
    const res = await appointmentsPost(json(walkIn));
    expect(res.status).toBe(402);
    expect((await res.json()).code).toBe("PLAN_EXPIRED");
  });

  it("uploads: 402 without imageUpload", async () => {
    asUser();
    db.planConfig.findUnique.mockResolvedValue(planConfig({ imageUpload: false }));
    const res = await uploadPost(new NextRequest("http://localhost/api/upload", { method: "POST" }));
    expect(res.status).toBe(402);
    expect((await res.json()).code).toBe("FEATURE_LOCKED");
  });

  it("CSV export: 402 without csvExport, a CSV with it", async () => {
    asUser();
    db.planConfig.findUnique.mockResolvedValue(planConfig({ csvExport: false }));
    const url = "http://localhost/api/appointments/export";
    expect((await exportGet(new NextRequest(url))).status).toBe(402);

    db.planConfig.findUnique.mockResolvedValue(planConfig({ csvExport: true }));
    db.appointment.findMany.mockResolvedValue([
      { ...busy("st-a", 10), client: { name: "=cmd()", email: "a@x.com", phone: "+919876543210" }, service: { name: "Cut" }, staff: { name: "A" }, price: 50, status: "confirmed", paymentStatus: "paid", duration: 60 },
    ]);
    const ok = await exportGet(new NextRequest(url));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toMatch(/text\/csv/);
    const body = await ok.text();
    expect(body).toContain(`"'=cmd()"`); // formula neutralised
    expect(body).toContain(`"+919876543210"`);
    expect(body).toContain('"2026-10-20","10:00"');
  });

  it("CSV export: 401 without a session", async () => {
    expect((await exportGet(new NextRequest("http://localhost/api/appointments/export"))).status).toBe(401);
  });
});
