import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Free follow-ups: one per completed appointment, same doctor + service + person, inside the business's window.
// Anything else is an ordinary paid booking. A ticket (from the verified customer's My bookings) carries the proof.

const db = vi.hoisted(() => ({
  customer: { findUnique: vi.fn() },
  appointment: { findFirst: vi.fn() },
  staff: { findFirst: vi.fn() },
}));
const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => session.current) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { evaluateFollowUp, followUpOffer, followUpUntil, type FollowUpFirst } from "@/lib/followUp";
import { FollowUpTicketError, followUpFromQuery, readFollowUpTicket, resolveFollowUp, signFollowUpTicket } from "@/lib/followUpDb";
import { signTicket } from "@/lib/signedTicket";
import { settingsPatchSchema } from "@/lib/validation/settings";
import { GET as followUpLink } from "@/app/api/customer/follow-up/route";

process.env.NEXTAUTH_SECRET = "test-secret";

const first: FollowUpFirst = { status: "completed", followUpOfId: null, hasFollowUp: false, staffId: "dr1", serviceId: "svc1", localDate: "2026-11-10", patientName: "Riya Kapoor" };
const booking = { staffId: "dr1", serviceIds: ["svc1"], localDate: "2026-11-15", patientName: "riya  kapoor" };
const ev = (over: object = {}, b: object = {}) => evaluateFollowUp({ days: 14, first: { ...first, ...over }, booking: { ...booking, ...b } });

describe("who gets a free follow-up (pure rules)", () => {
  it("same doctor, service and person inside the window is free, until first date + days", () => {
    expect(ev()).toEqual({ free: true, until: "2026-11-24" });
    expect(followUpUntil("2026-11-10", 14)).toBe("2026-11-24");
  });
  it("the window includes the first day and the last day, and ends after it", () => {
    expect(ev({}, { localDate: "2026-11-10" }).free).toBe(true);
    expect(ev({}, { localDate: "2026-11-24" }).free).toBe(true);
    expect(ev({}, { localDate: "2026-11-25" })).toEqual({ free: false, reason: "outside-window" });
    expect(ev({}, { localDate: "2026-11-09" })).toEqual({ free: false, reason: "outside-window" });
  });
  it("a different doctor, a different or extra service, or another person is a normal paid booking", () => {
    expect(ev({}, { staffId: "dr2" })).toEqual({ free: false, reason: "other-doctor" });
    expect(ev({}, { staffId: null })).toEqual({ free: false, reason: "other-doctor" });
    expect(ev({}, { serviceIds: ["svc2"] })).toEqual({ free: false, reason: "other-service" });
    expect(ev({}, { serviceIds: ["svc1", "svc2"] })).toEqual({ free: false, reason: "other-service" });
    expect(ev({}, { patientName: "Someone Else" })).toEqual({ free: false, reason: "other-person" });
  });
  it("only a completed appointment earns one, never a follow-up, and only once", () => {
    for (const status of ["confirmed", "pending", "cancelled", "no-show", "pending_payment"]) {
      expect(ev({ status })).toEqual({ free: false, reason: "not-completed" });
    }
    expect(ev({ followUpOfId: "x" })).toEqual({ free: false, reason: "is-follow-up" });
    expect(ev({ hasFollowUp: true })).toEqual({ free: false, reason: "already-used" });
  });
  it("0 days turns the feature off", () => {
    expect(evaluateFollowUp({ days: 0, first, booking })).toEqual({ free: false, reason: "off" });
  });
  it("My bookings offers it only while it is still possible", () => {
    expect(followUpOffer(first, 14, "2026-11-24")).toEqual({ until: "2026-11-24" });
    expect(followUpOffer(first, 14, "2026-11-25")).toBeNull();
    expect(followUpOffer(first, 0, "2026-11-11")).toBeNull();
    expect(followUpOffer({ ...first, hasFollowUp: true }, 14, "2026-11-11")).toBeNull();
    expect(followUpOffer({ ...first, status: "confirmed" }, 14, "2026-11-11")).toBeNull();
  });
});

describe("the follow-up ticket", () => {
  const business = { id: "b1", timezone: "Asia/Kolkata", followUpDays: 14 };
  const appt = (over: object = {}) => ({
    status: "completed", staffId: "dr1", serviceId: "svc1", date: new Date("2026-11-10T05:00:00Z"), patientName: null, followUpOfId: null,
    client: { name: "Riya Kapoor", email: "riya@mail.test" }, followUp: null, ...over,
  });
  beforeEach(() => {
    vi.clearAllMocks();
    db.customer.findUnique.mockResolvedValue({ email: "riya@mail.test", emailVerified: new Date() });
    db.appointment.findFirst.mockResolvedValue(appt());
  });
  const spend = (o: object = {}) => resolveFollowUp(db as never, { ticket: signFollowUpTicket("c1", "a1"), business, staffId: "dr1", serviceIds: ["svc1"], date: "2026-11-15", patientName: "Riya Kapoor", bookerEmail: "Riya@Mail.test", ...o });

  it("round-trips, and a forged, expired or other-purpose ticket is rejected", async () => {
    expect(readFollowUpTicket(signFollowUpTicket("c1", "a1"))).toEqual({ customerId: "c1", appointmentId: "a1" });
    expect(readFollowUpTicket(signFollowUpTicket("c1", "a1").replace("c1", "c2"))).toBeNull();
    expect(readFollowUpTicket(signTicket("follow-up", "c1:a1", "test-secret", 1000, Date.now() - 5000))).toBeNull();
    expect(readFollowUpTicket(signTicket("signup-ticket", "c1:a1", "test-secret", 60_000))).toBeNull();
    expect(readFollowUpTicket("nonsense")).toBeNull();
    await expect(spend({ ticket: "nonsense" })).rejects.toBeInstanceOf(FollowUpTicketError);
  });
  it("a valid ticket on a matching booking makes it free and links the first appointment", async () => {
    expect(await spend()).toMatchObject({ followUpOfId: "a1", result: { free: true } });
  });
  it("a different doctor or a date past the window is NOT free but still goes through as a normal booking", async () => {
    expect((await spend({ staffId: "dr2" })).followUpOfId).toBeNull();
    expect((await spend({ date: "2026-12-30" })).followUpOfId).toBeNull();
  });
  it("a booking made with someone else's contact email is not free", async () => {
    expect((await spend({ bookerEmail: "other@mail.test" })).followUpOfId).toBeNull();
  });
  it("an unverified customer, or an appointment that belongs to another email, is refused", async () => {
    db.customer.findUnique.mockResolvedValue({ email: "riya@mail.test", emailVerified: null });
    await expect(spend()).rejects.toBeInstanceOf(FollowUpTicketError);
    db.customer.findUnique.mockResolvedValue({ email: "riya@mail.test", emailVerified: new Date() });
    db.appointment.findFirst.mockResolvedValue(appt({ client: { name: "X", email: "someone@else.test" } }));
    await expect(spend()).rejects.toBeInstanceOf(FollowUpTicketError);
    db.appointment.findFirst.mockResolvedValue(null); // another business's appointment
    await expect(spend()).rejects.toBeInstanceOf(FollowUpTicketError);
  });
  it("a second follow-up on the same appointment is not free", async () => {
    db.appointment.findFirst.mockResolvedValue(appt({ followUp: { id: "f1" } }));
    expect((await spend()).followUpOfId).toBeNull();
  });
  it("the booking page only shows the offer while the window is open", async () => {
    db.staff.findFirst.mockResolvedValue({ name: "Dr Rao" });
    const t = signFollowUpTicket("c1", "a1");
    expect(await followUpFromQuery(t, business)).toMatchObject({ staffId: "dr1", serviceId: "svc1", doctorName: "Dr Rao", until: "2026-11-24", email: "riya@mail.test" });
    expect(await followUpFromQuery(t, { ...business, followUpDays: 0 })).toBeNull();
    expect(await followUpFromQuery("garbage", business)).toBeNull();
  });
});

describe("follow-up link from My bookings", () => {
  const req = (id: string) => new NextRequest(`http://localhost/api/customer/follow-up?appointment=${id}`);
  it("sends a guest to the login page, and never signs a ticket for someone else's appointment", async () => {
    session.current = null;
    expect((await followUpLink(req("a1"))).headers.get("location")).toContain("/my/login");
    session.current = { user: { kind: "customer", customerId: "c1" } };
    db.customer.findUnique.mockResolvedValue({ id: "c1", name: "Riya", email: "riya@mail.test", emailVerified: new Date(), passwordChangedAt: null });
    db.appointment.findFirst.mockResolvedValue(null);
    expect((await followUpLink(req("not-mine"))).headers.get("location")).toMatch(/\/my$/);
  });
});

describe("the business setting", () => {
  it("accepts 0 to 365 whole days and rejects the rest", () => {
    expect(settingsPatchSchema.safeParse({ followUpDays: 14 }).success).toBe(true);
    expect(settingsPatchSchema.safeParse({ followUpDays: 0 }).success).toBe(true);
    expect(settingsPatchSchema.safeParse({ followUpDays: 366 }).success).toBe(false);
    expect(settingsPatchSchema.safeParse({ followUpDays: -1 }).success).toBe(false);
    expect(settingsPatchSchema.safeParse({ followUpDays: 2.5 }).success).toBe(false);
  });
});
