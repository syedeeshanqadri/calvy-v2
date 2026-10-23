import { describe, it, expect, vi } from "vitest";
import { loadMonthAvailability } from "@/lib/availability";

// Month view: days with no free slot for the chosen services + staff, and "next available".
const NOW = new Date("2026-10-14T00:00:00Z").getTime();
const svc = (id: string) => ({ id, duration: 60, capacity: 1, isActive: true, bufferBeforeMin: 0, bufferAfterMin: 0, businessId: "b" });

function fakeDb(over: { staff?: unknown[]; timeOff?: unknown[]; appts?: unknown[]; services?: unknown[] } = {}) {
  return {
    business: { findUnique: vi.fn(async () => ({ timezone: "Asia/Kolkata", slotInterval: 60, minNoticeMinutes: 0, maxAdvanceDays: 90 })) },
    service: { findMany: vi.fn(async () => over.services ?? [svc("cut")]) },
    staff: { findMany: vi.fn(async () => over.staff ?? [{ id: "a", services: [{ serviceId: "cut" }] }]) },
    workingHours: { findMany: vi.fn(async () => []) }, // default Mon-Fri 09:00-18:00
    timeOff: { findMany: vi.fn(async () => over.timeOff ?? []) },
    appointment: { findMany: vi.fn(async () => over.appts ?? []) },
  } as never;
}
const q = { businessId: "b", month: "2026-10", serviceIds: ["cut"], now: NOW };

describe("loadMonthAvailability", () => {
  it("weekends and past days are greyed; weekdays from today are open", async () => {
    const r = await loadMonthAvailability(fakeDb(), q);
    if (!r.ok) throw new Error("expected ok");
    expect(r.days["2026-10-17"]).toBe(false); // Saturday
    expect(r.days["2026-10-18"]).toBe(false); // Sunday
    expect(r.days["2026-10-20"]).toBe(true); // Tuesday
    expect(r.days["2026-10-10"]).toBe(false); // already past
    expect(r.nextAvailable).toBeNull();
  });

  it("a staff holiday greys that day when only that staff qualifies", async () => {
    const off = [{ staffId: null, startAt: new Date("2026-10-19T18:30:00Z"), endAt: new Date("2026-10-20T18:30:00Z") }]; // 20 Oct, whole day IST
    const r = await loadMonthAvailability(fakeDb({ timeOff: off }), q);
    if (!r.ok) throw new Error("expected ok");
    expect(r.days["2026-10-20"]).toBe(false);
    expect(r.days["2026-10-21"]).toBe(true);
  });

  it("no qualified staff: every day is grey (and nothing is offered next month either)", async () => {
    const r = await loadMonthAvailability(fakeDb({ staff: [{ id: "a", services: [] }] }), q);
    if (!r.ok) throw new Error("expected ok");
    expect(Object.values(r.days).some(Boolean)).toBe(false);
    expect(r.nextAvailable).toBeNull();
  });

  it("only the chosen staff counts: another staff member's openings do not light up days", async () => {
    const staff = [{ id: "a", services: [{ serviceId: "cut" }] }, { id: "b", services: [{ serviceId: "cut" }] }];
    const db = fakeDb({ staff });
    const r = await loadMonthAvailability(db, { ...q, staffId: "c-unknown" });
    if (!r.ok) throw new Error("expected ok");
    expect(Object.values(r.days).some(Boolean)).toBe(false);
  });

  it("an empty month reports the next available day", async () => {
    // Everything in October is closed; November is open.
    const off = [{ staffId: null, startAt: new Date("2026-09-30T00:00:00Z"), endAt: new Date("2026-10-31T18:30:00Z") }];
    const r = await loadMonthAvailability(fakeDb({ timeOff: off }), q);
    if (!r.ok) throw new Error("expected ok");
    expect(Object.values(r.days).some(Boolean)).toBe(false);
    // time-off mock returns the same rows for every month, so only October stays closed:
    // Nov 2 2026 is a Monday and the first weekday after the closure window ends.
    expect(r.nextAvailable).toBe("2026-11-02");
  });

  it("unknown service is reported, not thrown", async () => {
    const r = await loadMonthAvailability(fakeDb({ services: [] }), q);
    expect(r).toEqual({ ok: false, reason: "service" });
  });
});
