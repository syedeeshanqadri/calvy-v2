import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// step-3/customer-events: the owner's appointment screen. Every change the customer should hear about queues
// exactly one message, a no-op queues none, and one request can queue several (completed + paid).

const session = { current: null as unknown };
const db = vi.hoisted(() => {
  const d: Record<string, any> = {
    business: { findUnique: vi.fn() },
    service: { findMany: vi.fn(), findUnique: vi.fn() },
    staff: { findMany: vi.fn(), findFirst: vi.fn() },
    workingHours: { findMany: vi.fn() },
    timeOff: { findMany: vi.fn() },
    appointment: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    payment: { findFirst: vi.fn() },
    $executeRaw: vi.fn(),
  };
  d.$transaction = vi.fn(async (fn: (tx: unknown) => unknown) => fn(d));
  return d;
});
const notify = vi.hoisted(() => vi.fn(async (..._items: unknown[]) => {}));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => session.current) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/notifications/enqueue", () => ({ notify }));
vi.mock("@/lib/onlinePayment", () => ({ refundPayment: vi.fn() }));

import { PATCH } from "@/app/api/appointments/[id]/route";

const patch = (body: unknown) =>
  PATCH(new NextRequest("http://localhost/api/appointments/a1", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ id: "a1" }) });

// 2026-10-20 10:00 IST = 04:30Z
const at = (h: number) => new Date(Date.UTC(2026, 9, 20, h - 5, -30));
const appt = (over: Record<string, unknown> = {}) => ({
  id: "a1", businessId: "biz", serviceId: "s1", staffId: "st-a", date: at(10), endAt: at(11), duration: 60, price: 500, notes: null, patientName: null,
  status: "confirmed", paymentStatus: "unpaid", isOnline: false, meetingUrl: null,
  client: { name: "Riya Kapoor", email: "riya@example.com" }, service: { name: "Cut", meetingUrl: null }, staff: { name: "Dr Rao", meetingUrl: null },
  business: { name: "Sunrise", slug: "sunrise", timezone: "Asia/Kolkata", currency: "INR", packId: "CLINIC", termsOverride: null },
  ...over,
});
/** The notifications the route queued, flattened (null = nothing to send, ignored). */
const queued = () => notify.mock.calls.flatMap((c) => c).filter(Boolean) as { event: string; template: string; subjectId: string; recipient: string; businessId: string; version?: string | number; payload: Record<string, unknown> }[];

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-14T00:00:00Z"));
  session.current = { user: { id: "u1", businessId: "biz" } };
  db.business.findUnique.mockResolvedValue({ timezone: "Asia/Kolkata", slotInterval: 30, minNoticeMinutes: 0, maxAdvanceDays: 90 });
  db.service.findMany.mockResolvedValue([{ id: "s1", name: "Cut", duration: 60, capacity: 1, isActive: true, bufferBeforeMin: 0, bufferAfterMin: 0 }]);
  db.service.findUnique.mockResolvedValue({ capacity: 1 });
  db.staff.findMany.mockResolvedValue([{ id: "st-a", services: [{ serviceId: "s1" }] }]);
  db.staff.findFirst.mockResolvedValue({ id: "st-a" });
  db.workingHours.findMany.mockResolvedValue([]);
  db.timeOff.findMany.mockResolvedValue([]);
  db.appointment.findMany.mockResolvedValue([]);
  db.appointment.findFirst.mockResolvedValue(appt());
  db.appointment.update.mockImplementation(async ({ data }: { data: object }) => ({ id: "a1", ...data }));
  db.payment.findFirst.mockResolvedValue(null);
  db.$executeRaw.mockResolvedValue(0);
  db.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(db));
});
afterEach(() => vi.useRealTimers());

describe("PATCH /api/appointments/[id]: customer notifications", () => {
  it("cancelling queues one cancellation, with a link to book again", async () => {
    expect((await patch({ status: "cancelled" })).status).toBe(200);
    expect(queued()).toHaveLength(1);
    expect(queued()[0]).toMatchObject({ event: "booking.cancelled", template: "cancellation", subjectId: "a1", recipient: "riya@example.com", businessId: "biz" });
    expect(queued()[0].payload.rebookUrl).toMatch(/\/sunrise$/);
  });

  it("cancelling something already cancelled queues nothing", async () => {
    db.appointment.findFirst.mockResolvedValue(appt({ status: "cancelled" }));
    await patch({ status: "cancelled" });
    expect(queued()).toHaveLength(0);
  });

  it("moving it queues one reschedule that says when it was", async () => {
    expect((await patch({ date: "2026-10-20", time: "14:00" })).status).toBe(200);
    expect(queued()).toHaveLength(1);
    expect(queued()[0]).toMatchObject({ event: "booking.rescheduled", template: "reschedule", subjectId: "a1", payload: { oldDate: expect.any(String), oldTime: "10:00 AM" } });
  });

  it("saving the same time again queues nothing", async () => {
    await patch({ date: "2026-10-20", time: "10:00" });
    expect(queued()).toHaveLength(0);
  });

  it("marking it paid queues one receipt, and marking it paid again queues none", async () => {
    await patch({ paymentStatus: "paid" });
    expect(queued()).toHaveLength(1);
    expect(queued()[0]).toMatchObject({ event: "booking.paid", template: "invoice", recipient: "riya@example.com", payload: { price: 500, invoiceNumber: expect.stringMatching(/^INV-/) } });
    expect(queued()[0].version).toBeUndefined(); // the same key as the dashboard's mark-paid button: one receipt either way
    notify.mockClear();
    db.appointment.findFirst.mockResolvedValue(appt({ paymentStatus: "paid" }));
    await patch({ paymentStatus: "paid" });
    expect(queued()).toHaveLength(0);
  });

  it("completed queues the thank-you; missed queues the missed notice; neither twice", async () => {
    await patch({ status: "completed" });
    expect(queued().map((q) => [q.event, q.template])).toEqual([["booking.completed", "status_change"]]);
    expect(queued()[0].payload).toMatchObject({ status: "completed" });
    notify.mockClear();
    await patch({ status: "no-show" });
    expect(queued().map((q) => q.event)).toEqual(["booking.no_show"]);
    expect(queued()[0].payload).toMatchObject({ status: "no_show" });
    notify.mockClear();
    db.appointment.findFirst.mockResolvedValue(appt({ status: "completed" }));
    await patch({ status: "completed" });
    expect(queued()).toHaveLength(0);
  });

  it("completed and paid in one save queue two different messages", async () => {
    await patch({ status: "completed", paymentStatus: "paid" });
    expect(queued().map((q) => q.event).sort()).toEqual(["booking.completed", "booking.paid"]);
  });

  it("cancelling and paying together sends the cancellation only", async () => {
    await patch({ status: "cancelled", paymentStatus: "paid" });
    expect(queued().map((q) => q.event)).toEqual(["booking.cancelled"]);
  });

  it("other edits (confirming, a note) queue nothing", async () => {
    await patch({ status: "confirmed" });
    await patch({ paymentMode: "postpaid" });
    expect(queued()).toHaveLength(0);
  });

  it("a customer with no email: the change is saved and nothing is queued", async () => {
    db.appointment.findFirst.mockResolvedValue(appt({ client: { name: "Riya", email: null } }));
    expect((await patch({ status: "cancelled" })).status).toBe(200);
    expect(queued()).toHaveLength(0);
  });

  it("a failed enqueue never fails the save", async () => {
    notify.mockRejectedValueOnce(new Error("db down"));
    const res = await patch({ status: "cancelled" });
    expect(res.status).toBe(200);
    expect(db.appointment.update).toHaveBeenCalled();
  });

  it("looks the booking up inside the signed-in business only", async () => {
    await patch({ status: "cancelled" });
    for (const [arg] of db.appointment.findFirst.mock.calls) expect(arg.where).toMatchObject({ id: "a1", businessId: "biz" });
  });
});
