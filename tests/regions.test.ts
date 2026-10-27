import { describe, it, expect } from "vitest";
import { REGIONS, currencyForRegion } from "@/lib/regions";
import { CURRENCIES } from "@/lib/currency";
import { signupSchema, onboardingSchema } from "@/lib/validation/public";

// chore/signup-region-only: owners pick a country/region; the currency is derived on the server.

const base = { name: "Asha", businessName: "Glow", email: "asha@example.com", password: "password123" };

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

describe("signup and onboarding take a region", () => {
  it("derive the currency from the region", () => {
    expect(signupSchema.safeParse({ ...base, region: "IN" }).data?.currency).toBe("INR");
    expect(signupSchema.safeParse({ ...base, region: "GB" }).data?.currency).toBe("GBP");
    expect(onboardingSchema.safeParse({ businessName: "Glow", region: "AE" }).data?.currency).toBe("AED");
  });
  it("the region wins over a client-sent currency", () => {
    expect(signupSchema.safeParse({ ...base, region: "IN", currency: "USD" }).data?.currency).toBe("INR");
  });
  it("an older client sending only a currency still works", () => {
    expect(signupSchema.safeParse({ ...base, currency: "USD" }).data?.currency).toBe("USD");
  });
  it("a missing or unknown region is refused with a plain message", () => {
    const none = signupSchema.safeParse(base);
    expect(none.success).toBe(false);
    expect(JSON.stringify(none.error?.issues)).toContain("country or region");
    expect(signupSchema.safeParse({ ...base, region: "XX" }).success).toBe(false);
    expect(onboardingSchema.safeParse({ businessName: "Glow" }).success).toBe(false);
  });
});
