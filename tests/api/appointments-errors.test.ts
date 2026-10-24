import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// Regression: a reschedule that outran Prisma's 5 s transaction limit threw
// "Transaction already closed" out of the route and Next answered with an empty
// 500, so the modal died on "Unexpected end of JSON input". Routes must always
// answer with JSON, the booking lock must allow real headroom, and delete works.

const session = { current: null as unknown };
const db = vi.hoisted(() => {
  const d: Record<string, any> = {
    business: { findUnique: vi.fn() },
    service: { findMany: vi.fn(), findUnique: vi.fn() },
    staff: { findMany: vi.fn(), findFirst: vi.fn() },
    workingHours: { findMany: vi.fn() },
    timeOff: { findMany: vi.fn() },
    appointment: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
    $executeRaw: vi.fn(),
  };
  d.$transaction = vi.fn(async (fn: (tx: unknown) => unknown) => fn(d));
  return d;
});

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => session.current) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/email", () => ({ sendBookingConfirmation: vi.fn(), sendBookingReschedule: vi.fn(), sendBookingCancellation: vi.fn(), sendInvoice: vi.fn() }));

import { PATCH, DELETE } from "@/app/api/appointments/[id]/route";
import { errorResponse, safeRoute } from "@/lib/api";
import { readJson } from "@/lib/fetchJson";
import { BOOKING_TX_OPTIONS } from "@/lib/booking";

const req = (method: string, body?: unknown) =>
  new NextRequest("http://localhost/api/appointments/a1", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const params = { params: Promise.resolve({ id: "a1" }) };
const asUser = () => (session.current = { user: { id: "u1", businessId: "biz" } });
// 2026-10-20 10:00 IST = 04:30Z
const at = (h: number) => new Date(Date.UTC(2026, 9, 20, h - 5, -30));
const appt = { id: "a1", businessId: "biz", serviceId: "s1", staffId: "st-a", date: at(10), endAt: at(11), duration: 60, status: "confirmed", paymentStatus: "unpaid" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-14T00:00:00Z"));
  session.current = null;
  db.business.findUnique.mockResolvedValue({ timezone: "Asia/Kolkata", slotInterval: 30, minNoticeMinutes: 0, maxAdvanceDays: 90 });
  db.service.findMany.mockResolvedValue([{ id: "s1", name: "Cut", duration: 60, capacity: 1, isActive: true, bufferBeforeMin: 0, bufferAfterMin: 0 }]);
  db.service.findUnique.mockResolvedValue({ capacity: 1 });
  db.staff.findMany.mockResolvedValue([{ id: "st-a", services: [{ serviceId: "s1" }] }]);
  db.staff.findFirst.mockResolvedValue({ id: "st-a" });
  db.workingHours.findMany.mockResolvedValue([]);
  db.timeOff.findMany.mockResolvedValue([]);
  db.appointment.findMany.mockResolvedValue([]);
  db.appointment.findFirst.mockResolvedValue(appt);
  db.appointment.update.mockImplementation(async ({ data }: { data: object }) => ({ id: "a1", ...data }));
  db.appointment.delete.mockResolvedValue({ id: "a1" });
  db.$executeRaw.mockResolvedValue(0);
  db.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(db));
});
afterEach(() => vi.useRealTimers());

describe("reschedule: the transaction timeout regression", () => {
  it("the booking lock transaction is given more than Prisma's 5 s default", async () => {
    asUser();
    const res = await PATCH(req("PATCH", { date: "2026-10-20", time: "14:00" }), params);
    expect(res.status).toBe(200);
    const options = db.$transaction.mock.calls[0][1];
    expect(options).toEqual(BOOKING_TX_OPTIONS);
    expect(options.timeout).toBeGreaterThanOrEqual(15_000);
  });

  it("a Prisma 'Transaction already closed' error answers 503 with a JSON message, not an empty body", async () => {
    asUser();
    db.$transaction.mockRejectedValue(Object.assign(new Error("Transaction already closed"), { code: "P2028" }));
    const res = await PATCH(req("PATCH", { date: "2026-10-20", time: "14:00" }), params);
    expect(res.status).toBe(503);
    expect(res.headers.get("content-type")).toMatch(/json/);
    const body = await res.json();
    expect(body.error).toMatch(/try again/i);
    expect(body.code).toBe("DB_UNAVAILABLE");
  });

  it("an unknown crash answers 500 with a JSON message and leaks no internals", async () => {
    asUser();
    db.$transaction.mockRejectedValue(new Error("secret connection string postgres://u:p@host"));
    const res = await PATCH(req("PATCH", { date: "2026-10-20", time: "14:00" }), params);
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(JSON.parse(text).error).toMatch(/something went wrong/i);
    expect(text).not.toContain("postgres://");
  });
});

describe("DELETE /api/appointments/[id]", () => {
  it("401 without a session", async () => {
    const res = await DELETE(req("DELETE"), params);
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBeTruthy();
    expect(db.appointment.delete).not.toHaveBeenCalled();
  });

  it("deletes the owner's appointment (lookup is scoped to the business)", async () => {
    asUser();
    const res = await DELETE(req("DELETE"), params);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(db.appointment.findFirst).toHaveBeenCalledWith({ where: { id: "a1", businessId: "biz" } });
    expect(db.appointment.delete).toHaveBeenCalledWith({ where: { id: "a1" } });
  });

  it("404 JSON for another business's appointment, nothing deleted", async () => {
    asUser();
    db.appointment.findFirst.mockResolvedValue(null);
    const res = await DELETE(req("DELETE"), params);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/not found/i);
    expect(db.appointment.delete).not.toHaveBeenCalled();
  });

  it("a database failure on delete answers JSON, not an empty 500", async () => {
    asUser();
    db.appointment.delete.mockRejectedValue(Object.assign(new Error("Can't reach database server"), { code: "P1001" }));
    const res = await DELETE(req("DELETE"), params);
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("DB_UNAVAILABLE");
  });
});

describe("error helpers", () => {
  it.each([
    ["P2002", 409],
    ["P2025", 404],
    ["P2003", 409],
    ["P1017", 503],
    ["P2024", 503],
    ["P9999", 500],
  ])("Prisma %s -> %i with a JSON error", async (code, status) => {
    const res = errorResponse(Object.assign(new Error("x"), { code }));
    expect(res.status).toBe(status);
    expect((await res.json()).error).toBeTruthy();
  });

  it("safeRoute passes results through and re-throws Next control-flow errors", async () => {
    const ok = safeRoute(async () => new Response("fine"));
    expect(await (await ok()).text()).toBe("fine");
    const redirect = safeRoute(async () => {
      throw Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login" });
    });
    await expect(redirect()).rejects.toThrow("NEXT_REDIRECT");
  });

  it("readJson turns an empty or HTML body into a readable error instead of throwing", async () => {
    expect((await readJson(new Response("", { status: 500 }))).error).toMatch(/error 500/);
    expect((await readJson(new Response("<html>oops</html>", { status: 502 }))).error).toMatch(/error 502/);
    expect(await readJson(new Response('{"a":1}'))).toEqual({ a: 1 });
  });
});
