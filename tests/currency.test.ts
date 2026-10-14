import { describe, it, expect } from "vitest";
import { DEFAULT_CURRENCY, formatCurrencyAmount } from "@/lib/currency";

describe("currency", () => {
  it("defaults to INR (must match the Razorpay charge currency)", () => {
    expect(DEFAULT_CURRENCY).toBe("INR");
  });

  it("formats an amount in the given currency", () => {
    const out = formatCurrencyAmount(1000, "INR");
    expect(out).toContain("1,000");
  });
});
