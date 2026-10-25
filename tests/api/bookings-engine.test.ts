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
  rateLimit: Object.assign(vi.fn(async () => ({ ok: true, retryAfter: 0 })), { peek: vi.fn(async () => ({ ok: true, retryAfter: 0 })) }),
  clientIp: () => "1.1.1.1",
}));

import { POST } from "@/app/api/bookings/route";
import { rateLimit } from "@/lib/ratelimit";
import { sendBookingConfirmation } from "@/lib/email";
import { sendBookingConfirmationWhatsApp } from "@/lib/whatsapp";

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
const valid = { businessSlug: "x", serviceId: "s1", date: "2026-10-20", time: "10:00", clientName: "Jo", clientEmail: "jo@x.com", clientPhone: "+91 98765 43210" };
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

  it("'No preference' never assigns a staff member who is not linked to the service", async () => {
    db.staff.findMany.mockResolvedValue([{ id: "st-a", services: [] }, staffRow("st-z")]);
    const res = await POST(req(valid));
    expect(res.status).toBe(200);
    expect(db.appointment.create.mock.calls[0][0].data.staffId).toBe("st-z");
    expect(db.$executeRaw.mock.calls[0][1]).toBe("st-z");
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
  const freeCfg = { maxMonthlyAppointments: 60 };
  const planCfg = (cfg: Record<string, unknown>) =>
    db.planConfig.findUnique.mockImplementation(async ({ where }: { where: { planId: string } }) =>
      where.planId === "free" ? { ...freeCfg, ...cfg } : { maxMonthlyAppointments: -1 });

  it("limit reached -> 402 with the customer message, phone and owner notice", async () => {
    db.business.findUnique.mockResolvedValue(business({ plan: "free", planStatus: "free" }));
    db.appointment.count.mockResolvedValue(60);
    const res = await POST(req(valid));
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.code).toBe("LIMIT_REACHED");
    expect(body.error).toBe("Online booking is unavailable right now, please contact Salon X on +91 99999 00000.");
    expect(push).toHaveBeenCalledTimes(1);
    expect(db.appointment.create).not.toHaveBeenCalled();
  });

  it("limit is re-checked inside the lock: parallel bookings cannot overshoot it", async () => {
    db.business.findUnique.mockResolvedValue(business({ plan: "free", planStatus: "free" }));
    db.appointment.count.mockResolvedValueOnce(29).mockResolvedValue(60); // passes the early check, full inside the lock
    const res = await POST(req(valid));
    expect(res.status).toBe(402);
    expect(db.appointment.create).not.toHaveBeenCalled();
    expect(db.$executeRaw.mock.calls.map((c: unknown[]) => c[1])).toContain("limit:biz");
  });

  it("no phone on file -> message without a number", async () => {
    db.business.findUnique.mockResolvedValue(business({ phone: null, plan: "free", planStatus: "free" }));
    db.appointment.count.mockResolvedValue(60);
    const res = await POST(req(valid));
    expect((await res.json()).error).toBe("Online booking is unavailable right now, please contact Salon X.");
  });

  it("owner is told at most once a day", async () => {
    db.business.findUnique.mockResolvedValue(business({ plan: "free", planStatus: "free" }));
    db.appointment.count.mockResolvedValue(60);
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
    // 500 this month (the monthly counter), none in the last 24 hours (the per-contact daily cap)
    db.appointment.count.mockImplementation(async (args: { where?: { createdAt?: { gte: Date } } }) =>
      (args?.where?.createdAt?.gte ?? new Date(0)) < new Date("2026-10-13T00:00:00Z") ? 500 : 0);
    expect((await POST(req(valid))).status).toBe(200);
  });
});

describe("POST /api/bookings: contact details and booking for someone else", () => {
  it("India (INR) needs a phone number: 400, nothing inserted", async () => {
    const { clientPhone: _drop, ...noPhone } = valid;
    const res = await POST(req(noPhone));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("A phone number is required.");
    expect(db.appointment.create).not.toHaveBeenCalled();
  });

  it("another country needs only an email", async () => {
    db.business.findUnique.mockResolvedValue(business({ currency: "USD" }));
    const { clientPhone: _drop, ...noPhone } = valid;
    const res = await POST(req(noPhone));
    expect(res.status).toBe(200);
  });

  it("stores who the appointment is for; defaults to the booker", async () => {
    await POST(req({ ...valid, patientName: "Meena Kapoor" }));
    expect(db.appointment.create.mock.calls.at(-1)?.[0].data.patientName).toBe("Meena Kapoor");
    await POST(req(valid));
    expect(db.appointment.create.mock.calls.at(-1)?.[0].data.patientName).toBe("Jo");
  });

  it("the same person twice on one day is refused with a message asking for another name", async () => {
    // The availability engine also lists appointments; only the duplicate lookup filters by client.
    db.appointment.findMany.mockImplementation(async (args: { where?: { clientId?: string } }) =>
      args?.where?.clientId ? [{ patientName: "Jo", status: "confirmed", holdExpiresAt: null, client: { name: "Jo" } }] : []);
    const res = await POST(req(valid));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("DUPLICATE_PATIENT");
    expect(body.error).toMatch(/Jo already has an appointment on .*To book for someone else, enter their name\./);
    expect(db.appointment.create).not.toHaveBeenCalled();
  });

  it("a different person's name is allowed even with the same contact", async () => {
    // The availability engine also lists appointments; only the duplicate lookup filters by client.
    db.appointment.findMany.mockImplementation(async (args: { where?: { clientId?: string } }) =>
      args?.where?.clientId ? [{ patientName: "Jo", status: "confirmed", holdExpiresAt: null, client: { name: "Jo" } }] : []);
    const res = await POST(req({ ...valid, patientName: "Meena Kapoor" }));
    expect(res.status).toBe(200);
  });

  const dupRows = async (args: { where?: { clientId?: string } }) =>
    args?.where?.clientId ? [{ patientName: "Jo", status: "confirmed", holdExpiresAt: null, client: { name: "Jo" } }] : [];
  const okLimit = async () => ({ ok: true, retryAfter: 0 });

  it("ordinary bookings never use up a contact's allowance (a stranger cannot lock someone out)", async () => {
    vi.mocked(rateLimit).mockClear();
    const res = await POST(req(valid));
    expect(res.status).toBe(200);
    expect(vi.mocked(rateLimit).mock.calls.map((c) => c[0]).filter((k) => k.startsWith("booking-dup:"))).toEqual([]);
  });

  it("each 'already has an appointment' answer counts against the contact, by email and by phone", async () => {
    db.appointment.findMany.mockImplementation(dupRows);
    vi.mocked(rateLimit).mockClear();
    const res = await POST(req({ ...valid, clientEmail: "Jo@X.com" }));
    expect(res.status).toBe(409);
    const keys = vi.mocked(rateLimit).mock.calls.map((c) => c[0]);
    // keyed on the requester too, so a stranger can only put themselves in cooldown
    expect(keys).toContain("booking-dup:biz:1.1.1.1:email:jo@x.com");
    expect(keys.some((k) => k.startsWith("booking-dup:biz:1.1.1.1:phone:+91"))).toBe(true);
  });

  it("a contact in cooldown gets the same 429 for EVERY booking, duplicate or not (no oracle)", async () => {
    vi.mocked(rateLimit.peek).mockResolvedValue({ ok: false, retryAfter: 120 });
    // no duplicate exists: still 429
    const clean = await POST(req(valid));
    // a duplicate exists: also 429, same body
    db.appointment.findMany.mockImplementation(dupRows);
    const dup = await POST(req(valid));
    expect(clean.status).toBe(429);
    expect(dup.status).toBe(429);
    expect(await clean.json()).toEqual(await dup.json());
    expect(clean.headers.get("Retry-After")).toBe("120");
    expect(db.appointment.create).not.toHaveBeenCalled();
    vi.mocked(rateLimit.peek).mockImplementation(okLimit);
  });

  it("the sixth duplicate answer in an hour starts the cooldown", async () => {
    db.appointment.findMany.mockImplementation(dupRows);
    vi.mocked(rateLimit).mockImplementationOnce(okLimit).mockImplementationOnce(okLimit).mockResolvedValueOnce({ ok: false, retryAfter: 300 });
    const res = await POST(req(valid));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("300");
  });

  it("over a contact's daily quota the booking STILL goes through, but the contact is not messaged", async () => {
    db.appointment.count.mockResolvedValue(30);
    const res = await POST(req(valid));
    expect(res.status).toBe(200);
    expect(db.appointment.create).toHaveBeenCalled();
    expect(sendBookingConfirmation).not.toHaveBeenCalled();
    expect(sendBookingConfirmationWhatsApp).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalled(); // the business still hears about it
    expect((await res.json()).confirmationWithheld).toBe(true); // and the booker is told, not left waiting
  });

  it("just under the quota the contact gets their confirmation as normal", async () => {
    db.appointment.count.mockResolvedValue(29);
    expect((await POST(req(valid))).status).toBe(200);
    expect(sendBookingConfirmation).toHaveBeenCalledTimes(1);
  });

  it("the cooldown for one requester does not stop the same contact booking from elsewhere", async () => {
    vi.mocked(rateLimit.peek).mockImplementation(async (key: string) => (key.includes(":1.1.1.1:") ? { ok: false, retryAfter: 60 } : { ok: true, retryAfter: 0 }));
    expect((await POST(req(valid))).status).toBe(429); // the probing requester
    vi.mocked(rateLimit.peek).mockImplementation(async (key: string) => (key.includes(":9.9.9.9:") ? { ok: false, retryAfter: 60 } : { ok: true, retryAfter: 0 }));
    expect((await POST(req(valid))).status).toBe(200); // the owner, from their own network
    vi.mocked(rateLimit.peek).mockImplementation(okLimit);
  });
});
