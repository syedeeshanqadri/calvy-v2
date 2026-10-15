import { describe, it, expect } from "vitest";
import {
  zonedToUtc, zonedTimeToUtc, zonedDayRange, utcToZoned, tzOffsetMinutes,
  addDays, weekdayOf, isValidTimeZone, safeTimeZone, formatDateLabel, formatTimeLabel,
} from "@/lib/time";

// S2-01. These assertions hold for any process TZ (run under TZ=UTC and TZ=Asia/Kolkata).
describe("lib/time (S2-01)", () => {
  it("IST wall-clock to UTC and back", () => {
    const d = zonedTimeToUtc("2026-10-16", "10:00", "Asia/Kolkata");
    expect(d.toISOString()).toBe("2026-10-16T04:30:00.000Z");
    expect(utcToZoned(d, "Asia/Kolkata")).toMatchObject({ date: "2026-10-16", time: "10:00", minutes: 600 });
  });

  it("date rolls over in the zone, not in UTC", () => {
    const d = new Date("2026-10-16T20:00:00Z"); // 01:30 next day in IST
    expect(utcToZoned(d, "Asia/Kolkata").date).toBe("2026-10-17");
    expect(utcToZoned(d, "UTC").date).toBe("2026-10-16");
  });

  it("DST: New York offset changes and day length is 23h / 25h", () => {
    expect(tzOffsetMinutes(new Date("2026-03-07T12:00:00Z"), "America/New_York")).toBe(-300);
    expect(tzOffsetMinutes(new Date("2026-03-09T12:00:00Z"), "America/New_York")).toBe(-240);
    // 09:00 local the day before and the day after spring-forward (2026-03-08)
    expect(zonedTimeToUtc("2026-03-07", "09:00", "America/New_York").toISOString()).toBe("2026-03-07T14:00:00.000Z");
    expect(zonedTimeToUtc("2026-03-09", "09:00", "America/New_York").toISOString()).toBe("2026-03-09T13:00:00.000Z");
    const spring = zonedDayRange("2026-03-08", "America/New_York");
    expect((spring.end.getTime() - spring.start.getTime()) / 3_600_000).toBe(23);
    const fall = zonedDayRange("2026-11-01", "America/New_York");
    expect((fall.end.getTime() - fall.start.getTime()) / 3_600_000).toBe(25);
  });

  it("day range in IST is 24h and starts at 18:30Z the day before", () => {
    const r = zonedDayRange("2026-10-16", "Asia/Kolkata");
    expect(r.start.toISOString()).toBe("2026-10-15T18:30:00.000Z");
    expect(r.end.toISOString()).toBe("2026-10-16T18:30:00.000Z");
  });

  it("rejects bad input without throwing", () => {
    expect(Number.isNaN(zonedTimeToUtc("2026-02-30", "10:00", "UTC").getTime())).toBe(true);
    expect(Number.isNaN(zonedTimeToUtc("2026-10-16", "bad", "UTC").getTime())).toBe(true);
    expect(isValidTimeZone("Not/AZone")).toBe(false);
    expect(safeTimeZone("Not/AZone")).toBe("Asia/Kolkata");
    expect(safeTimeZone("Europe/London")).toBe("Europe/London");
  });

  it("calendar helpers and labels", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(weekdayOf("2026-10-16")).toBe(5); // Friday
    const d = zonedToUtc("2026-10-16", 14 * 60 + 30, "Asia/Kolkata");
    expect(formatDateLabel(d, "Asia/Kolkata")).toBe("Friday, October 16");
    expect(formatTimeLabel(d, "Asia/Kolkata")).toBe("2:30 PM");
  });
});
