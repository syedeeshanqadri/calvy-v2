import { describe, expect, it, vi } from "vitest";
import { dayLabel, timeLabel, withTimeout } from "@/lib/nextFree";
import { parseBookingDeepLink } from "@/lib/deepLink";

const params = (q: Record<string, string>) => ({ get: (k: string) => q[k] ?? null });

describe("step-6/redesign-hero-availability: labels", () => {
  it("names today, tomorrow and later days", () => {
    expect(dayLabel("2026-10-26", "2026-10-26")).toBe("Today");
    expect(dayLabel("2026-10-27", "2026-10-26")).toBe("Tomorrow");
    expect(dayLabel("2026-10-28", "2026-10-26")).toBe("Wed 28 Oct");
    expect(dayLabel("2026-11-01", "2026-10-31")).toBe("Tomorrow");
  });
  it("formats times in 12-hour form and leaves odd input alone", () => {
    expect([timeLabel("00:05"), timeLabel("09:00"), timeLabel("12:00"), timeLabel("16:30"), timeLabel("23:45")])
      .toEqual(["12:05 AM", "9:00 AM", "12:00 PM", "4:30 PM", "11:45 PM"]);
    expect(timeLabel("soon")).toBe("soon");
  });
  it("a slow lookup falls back instead of waiting", async () => {
    vi.useFakeTimers();
    const slow = new Promise<string>((r) => setTimeout(() => r("late"), 5000));
    const p = withTimeout(slow, 100, "fallback");
    await vi.advanceTimersByTimeAsync(150);
    expect(await p).toBe("fallback");
    vi.useRealTimers();
    expect(await withTimeout(Promise.resolve("fast"), 100, "fallback")).toBe("fast");
  });
});

describe("step-6/redesign-hero-availability: deep link into the booking page", () => {
  const today = "2026-10-26";
  it("keeps a valid service, date and time", () => {
    expect(parseBookingDeepLink(params({ service: "s1", date: "2026-10-28", time: "16:30" }), today)).toEqual({ serviceId: "s1", date: "2026-10-28", time: "16:30" });
  });
  it("a plain ?service= link still works", () => {
    expect(parseBookingDeepLink(params({ service: "s1" }), today)).toEqual({ serviceId: "s1", date: null, time: null });
  });
  it("ignores a past or impossible date, and a time without a date", () => {
    expect(parseBookingDeepLink(params({ service: "s1", date: "2026-10-01", time: "10:00" }), today)).toEqual({ serviceId: "s1", date: null, time: null });
    expect(parseBookingDeepLink(params({ service: "s1", date: "2026-02-30", time: "10:00" }), today)?.date).toBeNull();
    expect(parseBookingDeepLink(params({ service: "s1", time: "10:00" }), today)?.time).toBeNull();
  });
  it("ignores a malformed time", () => {
    for (const t of ["25:00", "9:00", "10:60", "10:00; drop", ""]) expect(parseBookingDeepLink(params({ service: "s1", date: "2026-10-28", time: t }), today)?.time).toBeNull();
  });
  it("no service means no deep link", () => {
    expect(parseBookingDeepLink(params({ date: "2026-10-28" }), today)).toBeNull();
    expect(parseBookingDeepLink(null, today)).toBeNull();
  });
});
