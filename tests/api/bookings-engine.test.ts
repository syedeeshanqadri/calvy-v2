import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// S2-03 / S2-05: public booking route with a mocked Prisma. Asserts staff
// choice + lock key, plan limits (expired plan -> Free limits), the 402 message,
// the once-a-day owner notice, and inactive services.

const db = vi.hoisted(() => {
  const d: Record<string, any> = {
    business: { findUnique: vi.fn() },
    service: { findMany: vi.fn() },
    staff: { findMany: vi.fn(), findFirst: vi.fn() },
    workingHours: { findMany: vi.fn() },
    timeOff: { findMany: vi.fn() },
    appointment: { findMany: vi.fn(), count: vi.fn(), create: vi.fn() },
    client: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    notification: { findFirst: vi.fn() },
    planConfig: { findUnique: vi.fn() },
    $executeRaw: vi.fn(),
  };
  d.$transaction = vi.fn(async (fn: (tx: unknown) => unknown) => fn(d));
  return d;
});
const push = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/email", () => ({ sendBookingConfirmation: vi.fn() }));
vi.mock("@/lib/whatsapp", () => ({ sendBookingConfirmationWhatsApp: vi.fn() }));
vi.mock("@/lib/push", () => ({ sendPushToBusiness: push }));
vi.mock("@/lib/razorpay", () => ({ razorpay: {} }));
vi.mock("@/lib/ratelimit", () => ({
  rateLimit: vi.fn(async () => ({ ok: true, retryAfter: 0 })),
  clientIp: () => "1.1.1.1",
}));

import { POST } from "@/app/api/bookings/route";

const req = (body: unknown) =>
  new NextRequest("http://localhost/api/bookings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const service = { id: "s1", name: "Cut", duration: 60, price: 50, capacity: 1, isActive: true, bufferBeforeMin: 0, bufferAfterMin: 0, businessId: "biz" };
const business = (over: Record<string, unknown> = {}) => ({
  id: "biz", name: "Salon X", phone: "+91 99999 00000", slug: "x", currency: "INR", paymentMode: "postpaid",
  plan: "professional", planStatus: "active", trialEndsAt: null, timezone: "Asia/Kolkata",
  slotInterval: 30, minNoticeMinutes: 0, maxAdvanceDays: 90, services: [service], ...over,
});
const valid = { businessSlug: "x", serviceId: "s1", date: "2026-10-20", time: "10:00", clientName: "Jo", clientEmail: "jo@x.com" };
const staffRow = (id: string) => ({ id, services: [{ serviceId: "s1" }] });

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-14T00:00:00Z"));
  db.business.findUnique.mockResolvedValue(business());
  db.service.findMany.mockResolvedValue([service]);
  db.staff.findMany.mockResolvedValue([staffRow("st-a"), staffRow("st-b")]);
  db.workingHours.findMany.mockResolvedValue([]);
  db.timeOff.findMany.mockResolvedValue([]);
  db.appointment.findMany.mockResolvedValue([]);
  db.appointment.count.mockResolvedValue(0);
  db.appointment.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "appt1", ...data }));
  db.client.findFirst.mockResolvedValue({ id: "c1", name: "Jo", email: "jo@x.com" });
  db.client.update.mockResolvedValue({});
  db.staff.findFirst.mockResolvedValue({ name: "A" });
  db.notification.findFirst.mockResolvedValue(null);
  db.planConfig.findUnique.mockResolvedValue(null);
  db.$executeRaw.mockResolvedValue(0);
  db.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(db));
});
afterEach(() => vi.useRealTimers());

describe("POST /api/bookings: staff choice and locking", () => {
  it("'any available' picks the least-booked staff and locks on that staffId", async () => {
    // st-a already has two bookings that day (not overlapping 10:00)
    const day = (h: number) => ({ date: new Date(Date.UTC(2026, 9, 20, h - 6, -30)), endAt: new Date(Date.UTC(2026, 9, 20, h - 5, -30)), staffId: "st-a", serviceId: "s1", bufferBeforeMin: 0, bufferAfterMin: 0 });
    db.appointment.findMany.mockResolvedValue([day(13), day(15)]);
    const res = await POST(req(valid));
    expect(res.status).toBe(200);
    expect(db.appointment.create.mock.calls[0][0].data.staffId).toBe("st-b");
    // the lock key (first interpolated value) is the chosen staff member
    expect(db.$executeRaw.mock.calls[0][1]).toBe("st-b");
  });

  it("explicit staffId: only that staff is considered and locked", async () => {
    const res = await POST(req({ ...valid, staffId: "st-a" }));
    expect(res.status).toBe(200);
    expect(db.appointment.create.mock.calls[0][0].data.staffId).toBe("st-a");
    expect(db.$executeRaw.mock.calls[0][1]).toBe("st-a");
  });

  it("re-checks inside the lock: if the slot was taken meanwhile it tries the next staff, then 409", async () => {
    // First engine pass (outside the lock) sees both free; inside the lock st-a now has a booking.
    let pass = 0;
    db.appointment.findMany.mockImplementation(async () => {
      pass++;
      if (pass === 1) return [];
      return [{ date: new Date("2026-10-20T04:30:00Z"), endAt: new Date("2026-10-20T05:30:00Z"), staffId: "st-a", serviceId: "s1", bufferBeforeMin: 0, bufferAfterMin: 0 }];
    });
    const res = await POST(req({ ...valid, staffId: "st-a" }));
    expect(res.status).toBe(409);
    expect(db.appointment.create).not.toHaveBeenCalled();
  });

  it("a slot outside working hours (Sunday) is 409, nothing inserted", async () => {
    const res = await POST(req({ ...valid, date: "2026-10-18" }));
    expect(res.status).toBe(409);
    expect(db.appointment.create).not.toHaveBeenCalled();
  });

  it("staff not linked to the service are not offered", async () => {
    db.staff.findMany.mockResolvedValue([{ id: "st-a", services: [] }]);
    const res = await POST(req(valid));
    expect(res.status).toBe(409);
  });

  it("inactive service is rejected", async () => {
    db.business.findUnique.mockResolvedValue(business({ services: [{ ...service, isActive: false }] }));
    const res = await POST(req(valid));
    expect(res.status).toBe(400);
    expect(db.appointment.create).not.toHaveBeenCalled();
  });
});

describe("POST /api/bookings: plan limits (S2-05)", () => {
  const freeCfg = { maxMonthlyAppointments: 30 };
  const planCfg = (cfg: Record<string, unknown>) =>
    db.planConfig.findUnique.mockImplementation(async ({ where }: { where: { planId: string } }) =>
      where.planId === "free" ? { ...freeCfg, ...cfg } : { maxMonthlyAppointments: -1 });

  it("limit reached -> 402 with the customer message, phone and owner notice", async () => {
    db.business.findUnique.mockResolvedValue(business({ plan: "free", planStatus: "free" }));
    db.appointment.count.mockResolvedValue(30);
    const res = await POST(req(valid));
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.code).toBe("LIMIT_REACHED");
    expect(body.error).toBe("Online booking is unavailable right now, please contact Salon X on +91 99999 00000.");
    expect(push).toHaveBeenCalledTimes(1);
    expect(db.appointment.create).not.toHaveBeenCalled();
  });

  it("no phone on file -> message without a number", async () => {
    db.business.findUnique.mockResolvedValue(business({ phone: null, plan: "free", planStatus: "free" }));
    db.appointment.count.mockResolvedValue(30);
    const res = await POST(req(valid));
    expect((await res.json()).error).toBe("Online booking is unavailable right now, please contact Salon X.");
  });

  it("owner is told at most once a day", async () => {
    db.business.findUnique.mockResolvedValue(business({ plan: "free", planStatus: "free" }));
    db.appointment.count.mockResolvedValue(30);
    db.notification.findFirst.mockResolvedValue({ id: "n1" });
    const res = await POST(req(valid));
    expect(res.status).toBe(402);
    expect(push).not.toHaveBeenCalled();
  });

  it("expired plan is not rejected: Free-plan limits apply (read from the DB)", async () => {
    db.business.findUnique.mockResolvedValue(business({ plan: "professional", planStatus: "past_due" }));
    planCfg({ maxMonthlyAppointments: 5 });
    db.appointment.count.mockResolvedValue(4);
    expect((await POST(req(valid))).status).toBe(200);
    db.appointment.count.mockResolvedValue(5);
    expect((await POST(req(valid))).status).toBe(402);
  });

  it("an active paid plan keeps its own (unlimited) limits", async () => {
    planCfg({ maxMonthlyAppointments: 5 });
    db.appointment.count.mockResolvedValue(500);
    expect((await POST(req(valid))).status).toBe(200);
  });
});
