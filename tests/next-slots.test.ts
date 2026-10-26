import { describe, it, expect, vi } from "vitest";
import { loadNextSlots } from "@/lib/availability";

// The website's "next available" card: earliest slots over the next days from one context load.
// 2026-10-14 is a Wednesday; the default hours are Mon-Fri 09:00-18:00 and the business is in IST.
const NOW = new Date("2026-10-14T00:00:00Z").getTime(); // 05:30 IST
const svc = (id: string, capacity = 1) => ({ id, duration: 60, capacity, isActive: true, bufferBeforeMin: 0, bufferAfterMin: 0, businessId: "b" });

function fakeDb(over: { staff?: unknown[]; timeOff?: unknown[]; appts?: unknown[]; services?: unknown[] } = {}) {
  return {
    business: { findUnique: vi.fn(async () => ({ timezone: "Asia/Kolkata", slotInterval: 60, minNoticeMinutes: 0, maxAdvanceDays: 90 })) },
    service: { findMany: vi.fn(async () => over.services ?? [svc("cut")]) },
    staff: { findMany: vi.fn(async () => over.staff ?? [{ id: "a", services: [{ serviceId: "cut" }] }]) },
    workingHours: { findMany: vi.fn(async () => []) },
    timeOff: { findMany: vi.fn(async () => over.timeOff ?? []) },
    appointment: { findMany: vi.fn(async () => over.appts ?? []) },
  };
}

describe("loadNextSlots", () => {
  it("returns the earliest slots, two a day, four in all, with the business's today", async () => {
    const r = await loadNextSlots(fakeDb() as never, { businessId: "b", serviceId: "cut", now: NOW });
    if (!r.ok) throw new Error("expected ok");
    expect(r.today).toBe("2026-10-14");
    expect(r.slots).toEqual([
      { date: "2026-10-14", time: "09:00" }, { date: "2026-10-14", time: "10:00" },
      { date: "2026-10-15", time: "09:00" }, { date: "2026-10-15", time: "10:00" },
    ]);
  });

  it("loads the data once for the whole look-ahead, not once per day", async () => {
    const db = fakeDb();
    await loadNextSlots(db as never, { businessId: "b", serviceId: "cut", now: NOW, limit: 10, perDay: 1 });
    expect(db.appointment.findMany).toHaveBeenCalledTimes(1);
    expect(db.staff.findMany).toHaveBeenCalledTimes(1);
    expect(db.service.findMany).toHaveBeenCalledTimes(1);
  });

  it("skips a closed weekend and a booked-out day", async () => {
    // Friday 16 Oct is fully booked by the only staff member; Sat/Sun are closed.
    const appts = [{ date: new Date("2026-10-16T03:30:00Z"), endAt: new Date("2026-10-16T12:30:00Z"), staffId: "a", serviceId: "cut", bufferBeforeMin: 0, bufferAfterMin: 0 }];
    const r = await loadNextSlots(fakeDb({ appts }) as never, { businessId: "b", serviceId: "cut", now: NOW, limit: 8, perDay: 1 });
    if (!r.ok) throw new Error("expected ok");
    const dates = r.slots.map((s) => s.date);
    expect(dates).not.toContain("2026-10-16");
    expect(dates).not.toContain("2026-10-17");
    expect(dates).not.toContain("2026-10-18");
    expect(dates.slice(0, 3)).toEqual(["2026-10-14", "2026-10-15", "2026-10-19"]);
  });

  it("group services report the spots left", async () => {
    const r = await loadNextSlots(fakeDb({ services: [svc("cut", 12)] }) as never, { businessId: "b", serviceId: "cut", now: NOW, limit: 1 });
    if (!r.ok) throw new Error("expected ok");
    expect(r.slots[0]).toEqual({ date: "2026-10-14", time: "09:00", spots: 12 });
  });

  it("returns no slots, not an error, when nobody can do the service", async () => {
    const r = await loadNextSlots(fakeDb({ staff: [{ id: "a", services: [] }] }) as never, { businessId: "b", serviceId: "cut", now: NOW });
    expect(r).toMatchObject({ ok: true, slots: [] });
  });

  it("reports an unknown service instead of throwing", async () => {
    expect(await loadNextSlots(fakeDb({ services: [] }) as never, { businessId: "b", serviceId: "nope", now: NOW })).toEqual({ ok: false, reason: "service" });
  });
});
