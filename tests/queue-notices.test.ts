import { describe, it, expect, vi, beforeEach } from "vitest";

// step-3/customer-events: reception's queue actions. The customer is told when they are moved back (once per
// missed call) and when the token is closed, and nothing is sent when there is no address.

const mocks = vi.hoisted(() => {
  const db: Record<string, any> = {
    tokenSession: { findFirst: vi.fn() },
    appointment: { findMany: vi.fn(), update: vi.fn(async () => ({})) },
    business: { findUnique: vi.fn() },
    staff: { findUnique: vi.fn() },
    $executeRaw: vi.fn(async () => 0),
  };
  db.$transaction = vi.fn(async (fn: (tx: unknown) => unknown) => fn(db));
  return { db, notify: vi.fn(async (..._items: unknown[]) => {}), credit: vi.fn(async (..._a: unknown[]): Promise<null | { amountMinor: number; currency: string }> => null) };
});
vi.mock("@/lib/prisma", () => ({ prisma: mocks.db }));
vi.mock("@/lib/notifications/enqueue", () => ({ notify: mocks.notify }));
vi.mock("@/lib/creditDb", () => ({ creditClosedBooking: mocks.credit }));

import { runQueueAction, type QueueBusiness } from "@/lib/queueDb";

const biz: QueueBusiness = { id: "biz1", timezone: "Asia/Kolkata", name: "Sunrise", packId: "CLINIC", termsOverride: null, currency: "INR" };
const session = { id: "s1", businessId: "biz1", name: "Morning", startMin: 540, endMin: 720, minutesPerToken: 10, staffId: null, weekdays: [1], isActive: true };
const token = (n: number, over: Record<string, unknown> = {}) => ({
  id: `a${n}`, businessId: "biz1", tokenNumber: n, queuePosition: n, queueState: n === 1 ? "SERVING" : "WAITING", notPresentCount: 0, carriedFromId: null,
  servingStartedAt: n === 1 ? new Date("2026-11-02T03:30:00Z") : null, status: "confirmed", source: "ONLINE", isOnline: false, meetingUrl: null,
  patientName: null, price: 500, clientId: `c${n}`,
  client: { name: `Client ${n}`, email: `c${n}@example.com`, phone: null }, service: { name: "Checkup", meetingUrl: null }, staff: { meetingUrl: null },
  ...over,
});
const act = (action: "not_present" | "not_coming", id = "a1") => runQueueAction(biz, { sessionId: "s1", date: "2026-11-02", action, appointmentId: id });
type Queued = { event: string; template: string; subjectId: string; recipient: string; version?: number; payload: Record<string, any> };
const queued = () => mocks.notify.mock.calls.flatMap((c) => c).filter(Boolean) as Queued[];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.db.tokenSession.findFirst.mockResolvedValue(session);
  mocks.db.appointment.findMany.mockResolvedValue([token(1), token(2), token(3)]);
  mocks.db.business.findUnique.mockResolvedValue({ name: "Sunrise", slug: "sunrise", packId: "CLINIC", termsOverride: null, currency: "INR" });
  mocks.credit.mockResolvedValue(null);
});

describe("runQueueAction customer notices", () => {
  it("a missed call queues one moved-back notice with their new place and the number of calls missed", async () => {
    const res = await act("not_present");
    expect(res.outcome).toBe("moved_back");
    expect(queued()).toHaveLength(1);
    expect(queued()[0]).toMatchObject({
      event: "booking.queue_moved_back", template: "queue_moved_back", subjectId: "a1", recipient: "c1@example.com", version: 1,
      payload: { place: 3, businessName: "Sunrise", serviceName: "Checkup", token: { number: 1, sessionName: "Morning" } },
    });
  });

  it("the second and third missed calls are told too, under their own keys", async () => {
    mocks.db.appointment.findMany.mockResolvedValue([token(1, { notPresentCount: 1 }), token(2), token(3)]);
    await act("not_present");
    expect(queued()[0].version).toBe(2);
  });

  it("the fourth missed call closes the token and says what was saved in the wallet", async () => {
    mocks.db.appointment.findMany.mockResolvedValue([token(1, { notPresentCount: 3 }), token(2), token(3)]);
    mocks.credit.mockResolvedValue({ amountMinor: 50000, currency: "INR" });
    const res = await act("not_present");
    expect(res.outcome).toBe("no_show");
    expect(queued()).toHaveLength(1);
    expect(queued()[0]).toMatchObject({ event: "booking.queue_closed", template: "queue_closed", subjectId: "a1", payload: { reason: "missed", creditLabel: expect.stringContaining("500"), loginUrl: expect.stringMatching(/\/my$/) } });
  });

  it("cancelling at reception closes it as cancelled", async () => {
    const res = await act("not_coming", "a2");
    expect(res.outcome).toBe("cancelled");
    expect(queued().map((q) => [q.event, q.subjectId, q.payload.reason])).toEqual([["booking.queue_closed", "a2", "cancelled"]]);
  });

  it("a customer with no email address is not mailed, and the action still works", async () => {
    mocks.db.appointment.findMany.mockResolvedValue([token(1, { client: { name: "Walk-in", email: null, phone: null } }), token(2)]);
    const res = await act("not_present");
    expect(res.outcome).toBe("moved_back");
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it("a failed enqueue never undoes the queue action", async () => {
    mocks.notify.mockRejectedValueOnce(new Error("db down"));
    await expect(act("not_present")).resolves.toMatchObject({ outcome: "moved_back" });
    expect(mocks.db.appointment.update).toHaveBeenCalled();
  });
});
