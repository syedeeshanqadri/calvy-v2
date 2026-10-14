import { describe, it, expect } from "vitest";
import { isPastBooking, hasBookingConflict } from "@/lib/booking";

describe("isPastBooking", () => {
  const now = Date.parse("2026-06-01T12:00:00Z");

  it("rejects times before now", () => {
    expect(isPastBooking(now - 60_000, now)).toBe(true);
  });

  it("allows times at or after now", () => {
    expect(isPastBooking(now + 60_000, now)).toBe(false);
  });
});

describe("hasBookingConflict — capacity 1", () => {
  const base = Date.parse("2026-06-01T10:00:00Z");
  const existing = [{ start: base, durationMin: 30 }]; // 10:00–10:30

  it("flags an exact overlap", () => {
    expect(hasBookingConflict({ start: base, durationMin: 30, capacity: 1, existing })).toBe(true);
  });

  it("flags a partial overlap (starts during an existing slot)", () => {
    const start = base + 15 * 60_000; // 10:15
    expect(hasBookingConflict({ start, durationMin: 30, capacity: 1, existing })).toBe(true);
  });

  it("allows a slot that starts exactly when the previous ends", () => {
    const start = base + 30 * 60_000; // 10:30
    expect(hasBookingConflict({ start, durationMin: 30, capacity: 1, existing })).toBe(false);
  });

  it("allows a non-overlapping later slot", () => {
    const start = base + 60 * 60_000; // 11:00
    expect(hasBookingConflict({ start, durationMin: 30, capacity: 1, existing })).toBe(false);
  });

  it("allows when there are no existing bookings", () => {
    expect(hasBookingConflict({ start: base, durationMin: 30, capacity: 1, existing: [] })).toBe(false);
  });
});

describe("hasBookingConflict — capacity > 1 (group)", () => {
  const base = Date.parse("2026-06-01T10:00:00Z");

  it("allows additional bookings below capacity at the same slot", () => {
    const existing = [{ start: base, durationMin: 30 }]; // 1 of 3
    expect(hasBookingConflict({ start: base, durationMin: 30, capacity: 3, existing })).toBe(false);
  });

  it("blocks once the slot is at capacity", () => {
    const existing = [
      { start: base, durationMin: 30 },
      { start: base, durationMin: 30 },
      { start: base, durationMin: 30 },
    ];
    expect(hasBookingConflict({ start: base, durationMin: 30, capacity: 3, existing })).toBe(true);
  });
});
