import { describe, it, expect, vi, beforeEach } from "vitest";

// Security-review fix: wallet credit spent on a booking that never happens (hold lapsed, checkout failed, payment
// refunded after a lapse, cancelled, missed) is handed back once, and a lapsed hold also frees its follow-up lock.

const tx = vi.hoisted(() => ({
  $executeRaw: vi.fn(async () => 1),
  customerCredit: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
  payment: { findFirst: vi.fn(), updateMany: vi.fn() },
  appointment: { updateMany: vi.fn() },
}));
const db = vi.hoisted(() => ({
  appointment: { findMany: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/booking", () => ({ BOOKING_TX_OPTIONS: {} }));
vi.mock("@/lib/payments", () => ({ getPaymentProvider: () => null }));

import { creditClosedBooking, restoreUsedCredit } from "@/lib/creditDb";
import { releaseExpiredHolds } from "@/lib/onlinePayment";

const args = { businessId: "b1", clientId: "c1", appointmentId: "a1" };
beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation(async (fn: (t: unknown) => unknown) => fn(tx));
  tx.customerCredit.findMany.mockResolvedValue([]);
  tx.customerCredit.findUnique.mockResolvedValue(null);
  tx.payment.findFirst.mockResolvedValue(null);
});

describe("handing back credit a booking spent", () => {
  it("restores exactly what the booking spent, once, as a positive USED_REVERSED entry", async () => {
    tx.customerCredit.findMany.mockResolvedValue([{ kind: "USED", amountMinor: -700, currency: "INR" }]);
    expect(await restoreUsedCredit(tx as never, args)).toEqual({ amountMinor: 700, currency: "INR" });
    expect(tx.customerCredit.create).toHaveBeenCalledWith({ data: expect.objectContaining({ kind: "USED_REVERSED", amountMinor: 700, appointmentId: "a1" }) });
    expect(tx.$executeRaw).toHaveBeenCalled(); // under the wallet lock
  });
  it("does nothing when nothing was spent or it was already handed back", async () => {
    expect(await restoreUsedCredit(tx as never, args)).toBeNull();
    tx.customerCredit.findMany.mockResolvedValue([{ kind: "USED", amountMinor: -700, currency: "INR" }, { kind: "USED_REVERSED", amountMinor: 700, currency: "INR" }]);
    expect(await restoreUsedCredit(tx as never, args)).toBeNull();
    expect(tx.customerCredit.create).not.toHaveBeenCalled();
  });
  it("a lapsed hold: the sweep expires it, frees its follow-up lock and returns the credit", async () => {
    db.appointment.findMany.mockResolvedValue([{ id: "a1", businessId: "b1", clientId: "c1" }]);
    tx.customerCredit.findMany.mockResolvedValue([{ kind: "USED", amountMinor: -400, currency: "INR" }]);
    expect(await releaseExpiredHolds(new Date())).toBe(1);
    expect(tx.appointment.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "expired", followUpOfId: null } }));
    expect(tx.customerCredit.create).toHaveBeenCalledWith({ data: expect.objectContaining({ kind: "USED_REVERSED", amountMinor: 400 }) });
  });
  it("a missed or cancelled booking paid partly with credit gets that credit back even with no online payment", async () => {
    tx.customerCredit.findMany.mockResolvedValue([{ kind: "USED", amountMinor: -1000, currency: "INR" }]);
    expect(await creditClosedBooking(tx as never, { ...args, kind: "CANCELLED" })).toEqual({ amountMinor: 1000, currency: "INR" });
    expect(tx.customerCredit.create).toHaveBeenCalledTimes(1);
  });
});
