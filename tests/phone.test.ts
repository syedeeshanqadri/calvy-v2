import { describe, it, expect } from "vitest";
import { normalizePhone, callingCodeForTimezone } from "@/lib/phone";
import { csvCell } from "@/lib/csv";

describe("normalizePhone (E.164, default country from the business timezone)", () => {
  it.each([
    ["98765 43210", "Asia/Kolkata", "+919876543210"],
    ["+91 98765-43210", "Asia/Kolkata", "+919876543210"],
    ["(98765) 43210", "Asia/Kolkata", "+919876543210"],
    ["09876543210", "Asia/Kolkata", "+919876543210"],
    ["919876543210", "Asia/Kolkata", "+919876543210"],
    ["00919876543210", "Asia/Kolkata", "+919876543210"],
    ["+1 (415) 555-0132", "Asia/Kolkata", "+14155550132"],
    ["415 555 0132", "America/Los_Angeles", "+14155550132"],
    ["020 7946 0958", "Europe/London", "+442079460958"],
  ])("%s in %s -> %s", (raw, tz, expected) => {
    expect(normalizePhone(raw, tz)).toBe(expected);
  });

  it("the same person typed three ways is one number", () => {
    const a = normalizePhone("98765 43210", "Asia/Kolkata");
    expect(normalizePhone("+91-9876543210", "Asia/Kolkata")).toBe(a);
    expect(normalizePhone("919876543210", "Asia/Kolkata")).toBe(a);
  });

  it("rejects values that cannot be a phone number", () => {
    expect(normalizePhone("", "Asia/Kolkata")).toBeNull();
    expect(normalizePhone("   ", "Asia/Kolkata")).toBeNull();
    expect(normalizePhone("call me", "Asia/Kolkata")).toBeNull();
    expect(normalizePhone("12", "Asia/Kolkata")).toBeNull();
    expect(normalizePhone("+1234567890123456789", "Asia/Kolkata")).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
  });

  it("falls back to the product default country for unknown zones", () => {
    expect(callingCodeForTimezone(undefined)).toBe("91");
    expect(callingCodeForTimezone("Mars/Base")).toBe("91");
    expect(callingCodeForTimezone("Australia/Sydney")).toBe("61");
  });
});

describe("csvCell", () => {
  it("quotes, escapes quotes and neutralises formulas", () => {
    expect(csvCell('Jo "J" Smith')).toBe('"Jo ""J"" Smith"');
    expect(csvCell("=HYPERLINK(1)")).toBe(`"'=HYPERLINK(1)"`);
    expect(csvCell("@cmd")).toBe(`"'@cmd"`);
    expect(csvCell(null)).toBe('""');
    expect(csvCell(42)).toBe('"42"');
  });
  it("keeps a leading + on phone numbers", () => {
    expect(csvCell("+919876543210", { phone: true })).toBe('"+919876543210"');
    expect(csvCell("+919876543210")).toBe(`"'+919876543210"`);
  });
});
