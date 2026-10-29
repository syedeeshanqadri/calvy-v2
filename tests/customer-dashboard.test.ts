import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { manageability, buildUpdates, buildStats, type Wallet } from "@/lib/customerView";

// feat/customer-dashboard: customers see their bookings, can reschedule or cancel them, the business is
// told and the customer is emailed. Only the verified owner of a booking may touch it.

const HOUR = 3_600_000;
const now = new Date("2026-11-02T10:00:00Z");
const at = (h: number) => new Date(now.getTime() + h * HOUR);
const biz = (cancellationCutoffHours = 0) => ({ cancellationCutoffHours, name: "Sunrise Clinic" });

describe("who can change a booking", () => {
  it("a live, future, time-slot booking before the cutoff can be changed", () => {
    expect(manageability({ status: "confirmed", date: at(48), business: biz(24) }, now)).toEqual({ ok: true });
    expect(manageability({ status: "pending", date: at(1), business: biz(0) }, now)).toEqual({ ok: true });
  });
  it("closed statuses, past times and queue tokens cannot", () => {
    for (const status of ["completed", "cancelled", "no-show", "expired", "pending_payment"]) {
      expect(manageability({ status, date: at(48), business: biz() }, now)).toMatchObject({ ok: false, code: "STATUS" });
    }
    expect(manageability({ status: "confirmed", date: at(-1), business: biz() }, now)).toMatchObject({ ok: false, code: "PAST" });
    expect(manageability({ status: "confirmed", date: at(48), tokenNumber: 7, business: biz() }, now)).toMatchObject({ ok: false, code: "TOKEN" });
  });
  it("inside the business cutoff, the customer is sent to the business", () => {
    const r = manageability({ status: "confirmed", date: at(10), business: biz(24) }, now);
    expect(r).toMatchObject({ ok: false, code: "CUTOFF" });
    expect(!r.ok && r.reason).toContain("24 hours");
    expect(!r.ok && r.reason).toContain("Sunrise Clinic");
    expect(manageability({ status: "confirmed", date: at(24), business: biz(24) }, now)).toEqual({ ok: true }); // exactly on the cutoff
  });
});

describe("overview numbers and updates", () => {
  const wallets: Wallet[] = [{ businessId: "b1", businessName: "Glow", businessSlug: "glow", currency: "INR", balanceMinor: 50000 }];
  const rows = [
    { id: "a1", date: at(5), status: "confirmed", businessName: "Glow", serviceName: "Haircut", isOnline: false },
    { id: "a2", date: at(100), status: "confirmed", businessName: "Glow", serviceName: "Colour" },
    { id: "a3", date: at(-24 * 20), status: "cancelled", businessName: "Sunrise", serviceName: "Visit" },
    { id: "a4", date: at(-24 * 3), status: "completed", businessName: "Sunrise", serviceName: "Checkup" },
    { id: "a5", date: at(-24 * 90), status: "completed", businessName: "Sunrise", serviceName: "Old visit" },
  ];
  it("the feed has what is next, recent changes and credit, most urgent first", () => {
    const u = buildUpdates(rows, wallets, now);
    expect(u[0]).toMatchObject({ id: "soon-a1", tone: "info" });
    const ids = u.map((x) => x.id);
    expect(ids).toContain("cx-a3");
    expect(ids).toContain("done-a4");
    expect(ids).toContain("wal-b1");
    expect(ids).not.toContain("done-a5"); // too old
    expect(ids).not.toContain("soon-a2"); // not within 24 hours
  });
  it("is capped", () => {
    expect(buildUpdates(rows, wallets, now, 2)).toHaveLength(2);
  });
  it("counts upcoming, completed visits and distinct businesses", () => {
    const s = buildStats([{ date: at(5) }, { date: at(100) }], [{ status: "completed" }, { status: "cancelled" }, { status: "completed" }], ["glow", "glow", "sunrise"]);
    expect(s).toEqual({ upcoming: 2, completed: 2, businesses: 2, next: at(5) });
    expect(buildStats([], [], []).next).toBeNull();
  });
});

/* ── API: cancel and reschedule ─────────────────────────────────────────── */

const mocks = vi.hoisted(() => ({
  customer: { current: null as null | { id: string; email: string; name: string; verified: boolean } },
  db: {
    appointment: { findFirst: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    service: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
  email: { sendBookingCancellation: vi.fn(async (_d: Record<string, unknown>) => ({ ok: true })), sendBookingReschedule: vi.fn(async (_d: Record<string, unknown>) => ({ ok: true })) },
  push: vi.fn(async (_id: string, _p: Record<string, unknown>) => {}),
  creditClosedBooking: vi.fn(async () => null as null | { amountMinor: number; currency: string }),
  loadAvailability: vi.fn(),
  bookExclusive: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.db }));
vi.mock("@/lib/customerSession", () => ({ getCustomer: vi.fn(async () => mocks.customer.current) }));
vi.mock("@/lib/ratelimit", () => ({ rateLimit: vi.fn(async () => ({ ok: true, retryAfter: 0 })), clientIp: () => "1.1.1.1" }));
vi.mock("@/lib/email", () => mocks.email);
vi.mock("@/lib/push", () => ({ sendPushToBusiness: mocks.push }));
vi.mock("@/lib/creditDb", () => ({ creditClosedBooking: mocks.creditClosedBooking }));
vi.mock("@/lib/availability", () => ({ loadAvailability: mocks.loadAvailability }));
vi.mock("@/lib/booking", async (orig) => ({ ...(await orig<typeof import("@/lib/booking")>()), bookExclusive: mocks.bookExclusive }));

import { POST as cancelPost } from "@/app/api/customer/appointments/[id]/cancel/route";
import { POST as reschedulePost } from "@/app/api/customer/appointments/[id]/reschedule/route";
import { GET as slotsGet } from "@/app/api/customer/appointments/[id]/slots/route";

const params = (id = "a1") => ({ params: Promise.resolve({ id }) });
const row = (over: Record<string, unknown> = {}) => ({
  id: "a1", businessId: "biz1", clientId: "c1", staffId: "st1", serviceId: "s1", status: "confirmed", isOnline: false, meetingUrl: null, tokenNumber: null,
  date: new Date(Date.now() + 72 * HOUR), duration: 30, price: 500, patientName: null,
  client: { id: "c1", name: "Riya Kapoor", email: "riya@example.com" },
  service: { name: "Consultation", meetingUrl: null }, staff: { name: "Dr Rao", meetingUrl: null },
  business: { id: "biz1", name: "Sunrise Clinic", slug: "sunrise", timezone: "Asia/Kolkata", currency: "INR", cancellationCutoffHours: 0, packId: "CLINIC", termsOverride: null },
  ...over,
});
const future = () => {
  const d = new Date(Date.now() + 5 * 24 * HOUR);
  return { date: d.toISOString().slice(0, 10), time: "10:00" };
};
const req = (body?: unknown) => new NextRequest("http://localhost/api/customer/appointments/a1/x", { method: "POST", body: body ? JSON.stringify(body) : undefined, headers: { "content-type": "application/json" } });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.customer.current = { id: "cu1", email: "riya@example.com", name: "Riya", verified: true };
  mocks.db.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(mocks.db));
  mocks.db.appointment.updateMany.mockResolvedValue({ count: 1 });
  mocks.db.service.findUnique.mockResolvedValue({ capacity: 1 });
});

describe("only a verified customer can use these routes", () => {
  it("guests get 401 and an unverified account gets 403, before anything is read", async () => {
    mocks.customer.current = null;
    expect((await cancelPost(req(), params())).status).toBe(401);
    expect((await reschedulePost(req({ date: "2026-12-01", time: "10:00" }), params())).status).toBe(401);
    mocks.customer.current = { id: "cu1", email: "riya@example.com", name: "Riya", verified: false };
    expect((await cancelPost(req(), params())).status).toBe(403);
    expect((await slotsGet(new NextRequest("http://localhost/x?date=2026-12-01"), params())).status).toBe(403);
    expect(mocks.db.appointment.findFirst).not.toHaveBeenCalled();
  });
  it("a booking is looked up by the customer's own email, so someone else's id is just 404", async () => {
    mocks.db.appointment.findFirst.mockResolvedValue(null);
    expect((await cancelPost(req(), params("someone-elses"))).status).toBe(404);
    const where = mocks.db.appointment.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ id: "someone-elses", client: { email: { equals: "riya@example.com" } } });
    expect(mocks.db.appointment.updateMany).not.toHaveBeenCalled();
    expect(mocks.email.sendBookingCancellation).not.toHaveBeenCalled();
  });
});

describe("cancel", () => {
  it("cancels, tells the business and emails the customer", async () => {
    mocks.db.appointment.findFirst.mockResolvedValue(row());
    const res = await cancelPost(req(), params());
    expect(res.status).toBe(200);
    expect(mocks.db.appointment.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: "a1" }, data: { status: "cancelled" } });
    expect(mocks.push).toHaveBeenCalledTimes(1);
    expect(mocks.push.mock.calls[0][0]).toBe("biz1");
    expect(mocks.push.mock.calls[0][1]).toMatchObject({ title: expect.stringContaining("cancelled by the customer"), url: "/dashboard/appointments" });
    expect(mocks.email.sendBookingCancellation).toHaveBeenCalledTimes(1);
    expect(mocks.email.sendBookingCancellation.mock.calls[0][0]).toMatchObject({ to: "riya@example.com", businessName: "Sunrise Clinic" });
  });
  it("anything paid online comes back as credit, never as a card refund", async () => {
    mocks.db.appointment.findFirst.mockResolvedValue(row());
    mocks.creditClosedBooking.mockResolvedValue({ amountMinor: 50000, currency: "INR" });
    const body = await (await cancelPost(req(), params())).json();
    expect(body.credit).toEqual({ amountMinor: 50000, currency: "INR" });
    expect((mocks.creditClosedBooking.mock.calls[0] as unknown[])[1]).toMatchObject({ kind: "CANCELLED", appointmentId: "a1", clientId: "c1" });
  });
  it("inside the cutoff, a past booking, a token or an already closed one is refused and nothing is sent", async () => {
    for (const over of [
      { business: { ...row().business, cancellationCutoffHours: 100 } },
      { date: new Date(Date.now() - HOUR) },
      { tokenNumber: 4 },
      { status: "cancelled" },
    ]) {
      mocks.db.appointment.findFirst.mockResolvedValue(row(over));
      expect((await cancelPost(req(), params())).status).toBe(409);
    }
    expect(mocks.db.appointment.updateMany).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.email.sendBookingCancellation).not.toHaveBeenCalled();
  });
  it("a second click that loses the race cancels once and sends nothing", async () => {
    mocks.db.appointment.findFirst.mockResolvedValue(row());
    mocks.db.appointment.updateMany.mockResolvedValue({ count: 0 });
    expect((await cancelPost(req(), params())).status).toBe(409);
    expect(mocks.email.sendBookingCancellation).not.toHaveBeenCalled();
  });
});

describe("reschedule", () => {
  const avail = (times: string[]) => ({ ok: true, available: new Map(times.map((t) => [t, { resourceIds: ["st1"], spots: 1 }])) });

  it("moves the booking, tells the business and emails the new time", async () => {
    const when = future();
    mocks.db.appointment.findFirst.mockResolvedValue(row());
    mocks.loadAvailability.mockResolvedValue(avail([when.time]));
    mocks.bookExclusive.mockImplementation(async (_db: unknown, _opts: unknown, write: (tx: unknown) => unknown) => write(mocks.db));
    const res = await reschedulePost(req(when), params());
    expect(res.status).toBe(200);
    const data = mocks.db.appointment.updateMany.mock.calls[0][0];
    expect(data.where).toMatchObject({ id: "a1" });
    expect(data.data).toMatchObject({ staffId: "st1", reminderSent: false });
    expect(mocks.push.mock.calls[0][1]).toMatchObject({ title: expect.stringContaining("rescheduled by the customer") });
    expect(mocks.email.sendBookingReschedule).toHaveBeenCalledTimes(1);
    expect(mocks.email.sendBookingReschedule.mock.calls[0][0]).toMatchObject({ to: "riya@example.com", oldDate: expect.any(String), oldTime: expect.any(String) });
  });
  it("a time the engine does not offer is a 409 and nothing changes", async () => {
    const when = future();
    mocks.db.appointment.findFirst.mockResolvedValue(row());
    mocks.loadAvailability.mockResolvedValue(avail(["11:30"]));
    const res = await reschedulePost(req(when), params());
    expect(res.status).toBe(409);
    expect(mocks.bookExclusive).not.toHaveBeenCalled();
    expect(mocks.email.sendBookingReschedule).not.toHaveBeenCalled();
  });
  it("a time in the past, malformed input and the cutoff are refused", async () => {
    mocks.db.appointment.findFirst.mockResolvedValue(row());
    mocks.loadAvailability.mockResolvedValue(avail(["10:00"]));
    expect((await reschedulePost(req({ date: "2020-01-01", time: "10:00" }), params())).status).toBe(400);
    expect((await reschedulePost(req({ date: "tomorrow", time: "10:00" }), params())).status).toBe(400);
    mocks.db.appointment.findFirst.mockResolvedValue(row({ business: { ...row().business, cancellationCutoffHours: 100 } }));
    expect((await reschedulePost(req(future()), params())).status).toBe(409);
    expect(mocks.bookExclusive).not.toHaveBeenCalled();
  });
  it("the slot list uses the booking's own staff member and ignores its own slot", async () => {
    mocks.db.appointment.findFirst.mockResolvedValue(row());
    mocks.loadAvailability.mockResolvedValue(avail(["10:00", "09:00"]));
    const res = await slotsGet(new NextRequest(`http://localhost/x?date=${future().date}`), params());
    expect(res.status).toBe(200);
    expect((await res.json()).times).toEqual([{ time: "09:00" }, { time: "10:00" }]);
    expect(mocks.loadAvailability.mock.calls[0][1]).toMatchObject({ staffId: "st1", excludeAppointmentId: "a1", businessId: "biz1" });
  });
});

describe("review follow-ups", () => {
  const avail = (times: string[]) => ({ ok: true, available: new Map(times.map((t) => [t, { resourceIds: ["st1"], spots: 1 }])) });
  it("a reschedule that loses a race with a cancel changes nothing and says so", async () => {
    const when = future();
    mocks.db.appointment.findFirst.mockResolvedValue(row());
    mocks.loadAvailability.mockResolvedValue(avail([when.time]));
    mocks.db.appointment.updateMany.mockResolvedValue({ count: 0 });
    mocks.bookExclusive.mockImplementation(async (_db: unknown, _opts: unknown, write: (tx: unknown) => unknown) => write(mocks.db));
    const res = await reschedulePost(req(when), params());
    expect(res.status).toBe(409);
    expect(mocks.db.appointment.updateMany.mock.calls[0][0].where).toMatchObject({ id: "a1", status: { in: ["confirmed", "pending"] } });
    expect(mocks.email.sendBookingReschedule).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });
  it("the new time must also be outside the business cutoff", async () => {
    mocks.db.appointment.findFirst.mockResolvedValue(row({ date: new Date(Date.now() + 200 * HOUR), business: { ...row().business, cancellationCutoffHours: 100 } }));
    mocks.loadAvailability.mockResolvedValue(avail(["10:00"]));
    const soon = new Date(Date.now() + 26 * HOUR);
    const res = await reschedulePost(req({ date: soon.toISOString().slice(0, 10), time: "10:00" }), params());
    expect(res.status).toBe(409);
    expect(mocks.bookExclusive).not.toHaveBeenCalled();
  });
});
