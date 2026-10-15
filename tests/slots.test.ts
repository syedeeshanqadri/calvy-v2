import { describe, it, expect } from "vitest";
import { generateSlots, MAX_SLOTS } from "@/lib/booking";

describe("generateSlots", () => {
  it("generates 30 minute slots", () => {
    expect(generateSlots("09:00", "11:00", 30)).toEqual(["09:00", "09:30", "10:00", "10:30"]);
  });
  it("excludes the end time and handles a partial last step", () => {
    expect(generateSlots("09:00", "10:00", 45)).toEqual(["09:00", "09:45"]);
  });
  it.each([0, -5, NaN, Infinity, -Infinity])("returns [] for step %s", (step) => {
    expect(generateSlots("09:00", "18:00", step)).toEqual([]);
  });
  it("returns [] for non-number step", () => {
    expect(generateSlots("09:00", "18:00", "30" as unknown as number)).toEqual([]);
  });
  it.each([
    ["", "18:00"],
    ["09:00", ""],
    ["9", "18:00"],
    ["abc", "def"],
    ["25:00", "26:00"],
    ["09:60", "18:00"],
  ])("returns [] for bad times %s -> %s", (s, e) => {
    expect(generateSlots(s, e, 30)).toEqual([]);
  });
  it("returns [] when end <= start", () => {
    expect(generateSlots("18:00", "09:00", 30)).toEqual([]);
    expect(generateSlots("09:00", "09:00", 30)).toEqual([]);
  });
  it("never exceeds the cap", () => {
    expect(generateSlots("00:00", "24:00", 1).length).toBe(MAX_SLOTS);
    expect(generateSlots("00:00", "24:00", 0.001).length).toBe(MAX_SLOTS);
    expect(MAX_SLOTS).toBe(288);
  });
  it("terminates quickly for step 0 (regression: slotInterval 0 hung the endpoint)", () => {
    const t = Date.now();
    generateSlots("00:00", "23:59", 0);
    expect(Date.now() - t).toBeLessThan(100);
  });
});
