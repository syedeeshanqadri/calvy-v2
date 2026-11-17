import { describe, it, expect, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { claimWaiver, feeKept, keepConfirmationFee, releaseWaiver, waiverAvailable } from "@/lib/waiver";

function tx(over: Record<string, any> = {}) {
  return {
    confirmationWaiver: { findUnique: vi.fn(async () => null), create: vi.fn(async () => ({})), findFirst: vi.fn(async () => null), updateMany: vi.fn(async () => ({ count: 1 })), count: vi.fn(async () => 0), ...(over.confirmationWaiver ?? {}) },
    payment: { findFirst: vi.fn(async () => ({ id: "p1" })), ...(over.payment ?? {}) },
  } as any;
}
const ids = { businessId: "b1", clientId: "c1", appointmentId: "a1" };

describe("a Rs 10 booking that is cancelled or not attended keeps the fee", () => {
  it("creates one waiver, only for Calvy's own paid confirmation fee (no gateway, fee > 0)", async () => {
    const t = tx();
    expect(await keepConfirmationFee(t, ids)).toBe(true);
    expect(t.payment.findFirst.mock.calls[0][0].where).toMatchObject({ appointmentId: "a1", status: "PAID", gatewayId: null, platformFeeMinor: { gt: 0 } });
    expect(t.confirmationWaiver.create).toHaveBeenCalledWith({ data: { businessId: "b1", clientId: "c1", sourceAppointmentId: "a1" } });
  });
  it("nothing paid (or a payment through the business's own gateway) means no waiver", async () => {
    const t = tx({ payment: { findFirst: vi.fn(async () => null) } });
    expect(await keepConfirmationFee(t, ids)).toBe(false);
    expect(t.confirmationWaiver.create).not.toHaveBeenCalled();
  });
  it("repeating it is safe: an existing waiver, or a unique-index race, still counts as kept once", async () => {
    const existing = tx({ confirmationWaiver: { findUnique: vi.fn(async () => ({ id: "w1" })) } });
    expect(await keepConfirmationFee(existing, ids)).toBe(true);
    expect(existing.confirmationWaiver.create).not.toHaveBeenCalled();
    const race = tx({ confirmationWaiver: { create: vi.fn(async () => { throw new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x" }); }) } });
    expect(await keepConfirmationFee(race, ids)).toBe(true);
  });
});

describe("rebook once without the Rs 10", () => {
  it("is available only while an unused waiver exists at that business", async () => {
    const db = tx({ confirmationWaiver: { count: vi.fn(async () => 1) } });
    expect(await waiverAvailable(db, "b1", "c1")).toBe(true);
    expect(db.confirmationWaiver.count.mock.calls[0][0].where).toEqual({ businessId: "b1", clientId: "c1", usedAppointmentId: null });
  });
  it("is claimed once: the conditional update decides the race", async () => {
    const win = tx({ confirmationWaiver: { findFirst: vi.fn(async () => ({ id: "w1" })), updateMany: vi.fn(async () => ({ count: 1 })) } });
    expect(await claimWaiver(win, ids)).toBe(true);
    expect(win.confirmationWaiver.updateMany.mock.calls[0][0].where).toEqual({ id: "w1", usedAppointmentId: null });
    const lose = tx({ confirmationWaiver: { findFirst: vi.fn(async () => ({ id: "w1" })), updateMany: vi.fn(async () => ({ count: 0 })) } });
    expect(await claimWaiver(lose, ids)).toBe(false);
    expect(await claimWaiver(tx(), ids)).toBe(false);
  });
  it("the waiver comes back if the booking that used it never happens", async () => {
    const t = tx();
    await releaseWaiver(t, "a2");
    expect(t.confirmationWaiver.updateMany).toHaveBeenCalledWith({ where: { usedAppointmentId: "a2" }, data: { usedAppointmentId: null, usedAt: null } });
  });
  it("a kept fee blocks refunding the Rs 10 (the customer would be paid twice)", async () => {
    expect(await feeKept(tx({ confirmationWaiver: { count: vi.fn(async () => 1) } }), "a1")).toBe(true);
    expect(await feeKept(tx(), "a1")).toBe(false);
    expect(await feeKept(tx(), null)).toBe(false);
  });
});
