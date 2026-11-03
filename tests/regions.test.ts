import { describe, it, expect } from "vitest";
import { REGIONS, currencyForRegion } from "@/lib/regions";
import { CURRENCIES } from "@/lib/currency";
import { onboardingSchema } from "@/lib/validation/public";

// chore/signup-region-only: owners pick a country/region; the currency is derived on the server.


describe("region to currency", () => {
  it("every region maps to a supported currency, with no duplicate codes", () => {
    const supported = new Set(CURRENCIES.map((c) => c.code));
    for (const r of REGIONS) expect(supported.has(r.currency), r.code).toBe(true);
    expect(new Set(REGIONS.map((r) => r.code)).size).toBe(REGIONS.length);
  });
  it("labels are plain country names, with no currency in them", () => {
    for (const r of REGIONS) expect(r.name).not.toMatch(/\b[A-Z]{3}\b|\$|€|£|₹/);
  });
  it("looks up known regions and refuses unknown ones", () => {
    expect(currencyForRegion("IN")).toBe("INR");
    expect(currencyForRegion("EU")).toBe("EUR");
    expect(currencyForRegion("XX")).toBeNull();
  });
});

describe("onboarding takes a region", () => {
  it("derives the currency from the region", () => {
    expect(onboardingSchema.safeParse({ businessName: "Glow", region: "AE" }).data?.currency).toBe("AED");
    expect(onboardingSchema.safeParse({ businessName: "Glow", region: "IN", currency: "USD" }).data?.currency).toBe("INR");
  });
  it("a missing or unknown region is refused", () => {
    expect(onboardingSchema.safeParse({ businessName: "Glow" }).success).toBe(false);
    expect(onboardingSchema.safeParse({ businessName: "Glow", region: "XX" }).success).toBe(false);
  });
});
