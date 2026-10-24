import { describe, it, expect } from "vitest";
import { computeSlots, subtractIntervals, type ResourceDay, type BusyAppt } from "@/lib/booking";
import { businessHoursFromJson, resolveDayHours, DEFAULT_BUSINESS_HOURS, type HoursRow } from "@/lib/schedule";
import { zonedTimeToUtc } from "@/lib/time";

// S2-03 / S2-04. Everything is expressed in the business zone, so results do not
// depend on the process TZ (run under TZ=UTC and TZ=Asia/Kolkata).
const TZ = "Asia/Kolkata";
const DATE = "2026-10-20"; // Tuesday
const NOW = zonedTimeToUtc("2026-10-14", "09:00", TZ).getTime();
const at = (time: string, date = DATE) => zonedTimeToUtc(date, time, TZ).getTime();
const iv = (a: string, b: string, date = DATE) => ({ start: at(a, date), end: at(b, date) });
const appt = (time: string, durMin: number, extra: Partial<BusyAppt> = {}): BusyAppt => ({
  start: at(time),
  end: at(time) + durMin * 60_000,
  bufferBeforeMin: 0,
  bufferAfterMin: 0,
  serviceId: "svc",
  ...extra,
});
const res = (id: string | null, over: Partial<ResourceDay> = {}): ResourceDay => ({
  id,
  hours: [{ startMin: 9 * 60, endMin: 12 * 60 }],
  timeOff: [],
  busy: [],
  dayBookings: 0,
  ...over,
});
const base = {
  tz: TZ,
  date: DATE,
  now: NOW,
  slotInterval: 30,
  minNoticeMinutes: 0,
  maxAdvanceDays: 90,
  durationMin: 60,
  bufferBeforeMin: 0,
  bufferAfterMin: 0,
  capacity: 1,
  serviceId: "svc",
};
const times = (r: ReturnType<typeof computeSlots>) => Array.from(r.available.keys()).sort();

describe("computeSlots", () => {
  it("steps through working hours and keeps starts where the service fits", () => {
    const r = computeSlots({ ...base, resources: [res("a")] });
    expect(times(r)).toEqual(["09:00", "09:30", "10:00", "10:30", "11:00"]); // 11:30 + 60 > 12:00
  });

  it("two staff can both be booked at 11:00; a booking only blocks its own staff", () => {
    const r = computeSlots({
      ...base,
      resources: [res("a", { busy: [appt("11:00", 60, { serviceId: "x" })] }), res("b")],
    });
    expect(r.available.get("11:00")!.resourceIds).toEqual(["b"]);
    expect(r.available.get("10:30")!.resourceIds).toEqual(["b"]); // 10:30-11:30 overlaps a's 11:00 booking
    expect(r.available.get("10:00")!.resourceIds.sort()).toEqual(["a", "b"]);
  });

  it("'any available' prefers fewest bookings that day, then id order", () => {
    const r = computeSlots({
      ...base,
      resources: [res("a", { dayBookings: 3 }), res("b", { dayBookings: 1 }), res("c", { dayBookings: 1 })],
    });
    expect(r.available.get("09:00")!.resourceIds).toEqual(["b", "c", "a"]);
  });

  it("lunch break (split hours) and time off remove slots", () => {
    const hours = [
      { startMin: 9 * 60, endMin: 10 * 60 + 30 },
      { startMin: 11 * 60 + 30, endMin: 13 * 60 },
    ];
    const r = computeSlots({ ...base, resources: [res("a", { hours })] });
    expect(times(r)).toEqual(["09:00", "09:30", "11:30", "12:00"]);

    const off = computeSlots({ ...base, resources: [res("a", { timeOff: [iv("10:00", "11:00")] })] });
    expect(times(off)).toEqual(["09:00", "11:00"]); // 09:00-10:00 fits before the block; 11:00 starts after it
  });

  it("a whole-day holiday leaves nothing", () => {
    const r = computeSlots({ ...base, resources: [res("a", { timeOff: [iv("00:00", "23:59")] })] });
    expect(r.available.size).toBe(0);
  });

  it("minimum notice and the advance window clip the day", () => {
    const sameMorning = zonedTimeToUtc(DATE, "08:00", TZ).getTime();
    const notice = computeSlots({ ...base, now: sameMorning, minNoticeMinutes: 150, resources: [res("a")] });
    expect(times(notice)[0]).toBe("10:30");
    const far = computeSlots({ ...base, maxAdvanceDays: 3, resources: [res("a")] });
    expect(far.available.size).toBe(0);
  });

  it("buffers must clear other bookings but may spill past closing", () => {
    const busy = [appt("10:00", 60, { bufferAfterMin: 15 })]; // occupies 10:00-11:15
    const r = computeSlots({ ...base, durationMin: 30, bufferBeforeMin: 15, resources: [res("a", { busy })] });
    expect(r.available.has("09:30")).toBe(true); // 09:15-10:00 ends exactly at the booking
    expect(r.available.has("10:30")).toBe(false);
    expect(r.available.has("11:00")).toBe(false); // starts before the after-buffer ends
    expect(r.available.has("11:30")).toBe(true); // 11:15-12:00 clears 11:15
    const wide = computeSlots({ ...base, durationMin: 30, bufferBeforeMin: 30, resources: [res("a", { busy })] });
    expect(wide.available.has("11:30")).toBe(false); // 11:00-12:00 now overlaps 11:15
    const spill = computeSlots({ ...base, durationMin: 30, bufferAfterMin: 45, resources: [res("a")] });
    expect(spill.available.has("11:30")).toBe(true); // the after-buffer runs past 12:00 closing
  });

  it("group services: up to capacity at the same start, other starts blocked", () => {
    const busy = [appt("10:00", 60), appt("10:00", 60)];
    const r = computeSlots({ ...base, capacity: 3, resources: [res("a", { busy })] });
    expect(r.available.get("10:00")).toMatchObject({ spots: 1 });
    expect(r.available.has("10:30")).toBe(false); // overlaps a running group
    const full = computeSlots({ ...base, capacity: 2, resources: [res("a", { busy })] });
    expect(full.available.has("10:00")).toBe(false);
    expect(full.all).toContain("10:00");
  });

  it("is DST-safe in a non-India zone", () => {
    // New York 2026-11-01 is the 25-hour fall-back day; 09:00-10:00 local still yields 09:00 and 09:30.
    const r = computeSlots({
      ...base,
      tz: "America/New_York",
      date: "2026-11-01",
      now: Date.UTC(2026, 9, 1),
      resources: [res("a", { hours: [{ startMin: 9 * 60, endMin: 10 * 60 + 30 }] })],
    });
    expect(times(r)).toEqual(["09:00", "09:30"]);
  });

  it("bad interval or duration returns nothing instead of looping", () => {
    expect(computeSlots({ ...base, slotInterval: 0, resources: [res("a")] }).all).toEqual([]);
    expect(computeSlots({ ...base, durationMin: 0, resources: [res("a")] }).all).toEqual([]);
  });
});

describe("subtractIntervals", () => {
  it("splits, trims and removes", () => {
    const base = [{ start: 0, end: 100 }];
    expect(subtractIntervals(base, [{ start: 40, end: 60 }])).toEqual([{ start: 0, end: 40 }, { start: 60, end: 100 }]);
    expect(subtractIntervals(base, [{ start: -5, end: 30 }])).toEqual([{ start: 30, end: 100 }]);
    expect(subtractIntervals(base, [{ start: 0, end: 100 }])).toEqual([]);
    expect(subtractIntervals(base, [{ start: 200, end: 300 }])).toEqual(base);
  });
});

describe("working hours helpers (S2-04)", () => {
  const rows: HoursRow[] = [
    { staffId: null, weekday: 2, startMin: 540, endMin: 1080 },
    { staffId: "s1", weekday: 2, startMin: 600, endMin: 720 },
    { staffId: "s1", weekday: 2, startMin: 780, endMin: 900 },
  ];
  it("staff with own rows follow only those; others inherit the business week", () => {
    expect(resolveDayHours(rows, "s1", 2)).toEqual([{ startMin: 600, endMin: 720 }, { startMin: 780, endMin: 900 }]);
    expect(resolveDayHours(rows, "s1", 3)).toEqual([]); // own schedule, no row = day off
    expect(resolveDayHours(rows, "s2", 2)).toEqual([{ startMin: 540, endMin: 1080 }]);
  });
  it("a business with no rows uses Mon-Fri 09:00-18:00", () => {
    expect(resolveDayHours([], null, 1)).toEqual([{ startMin: 540, endMin: 1080 }]);
    expect(resolveDayHours([], null, 0)).toEqual([]);
  });
  it("availabilityJson: enabled days, bad times, malformed JSON", () => {
    const json = JSON.stringify({ "1": { enabled: true, start: "10:00", end: "14:00" }, "2": { enabled: false, start: "09:00", end: "17:00" }, "3": { enabled: true, start: "xx", end: "yy" } });
    const r = businessHoursFromJson(json);
    expect(r.find((x) => x.weekday === 1)).toMatchObject({ startMin: 600, endMin: 840 });
    expect(r.find((x) => x.weekday === 2)).toBeUndefined();
    expect(r.find((x) => x.weekday === 3)).toMatchObject({ startMin: 540, endMin: 1080 });
    expect(businessHoursFromJson("{not json")).toEqual(DEFAULT_BUSINESS_HOURS);
    expect(businessHoursFromJson("{}")).toEqual(DEFAULT_BUSINESS_HOURS);
    expect(businessHoursFromJson(null)).toEqual(DEFAULT_BUSINESS_HOURS);
  });
});
