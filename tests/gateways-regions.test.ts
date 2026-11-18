import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { fromMinorUnits, minorExponent, toDecimalString, toMinorUnits } from "@/lib/currency";
import { regionOf } from "@/lib/payments/region";
import { GATEWAY_LIST, GATEWAYS, gatewayBlockReason, gatewaysForRegion } from "@/lib/payments/gatewayMeta";
import { canUseOwnGateway } from "@/lib/payments/access";
import { chargeForConfig, computeCharge, toMinor, type PayConfig } from "@/lib/fees";

describe("minor units per currency (one helper)", () => {
  it("INR, USD, EUR, GBP, AED: two decimals", () => {
    for (const c of ["INR", "USD", "EUR", "GBP", "AED"]) {
      expect(minorExponent(c)).toBe(2);
      expect(toMinorUnits(499.5, c)).toBe(49950);
      expect(fromMinorUnits(49950, c)).toBe(499.5);
      expect(toDecimalString(49950, c)).toBe("499.50");
    }
    expect(toMinorUnits(19.99, "USD")).toBe(1999);
    expect(toMinorUnits(0.29, "EUR")).toBe(29);
  });
  it("JPY: no decimals, whole yen", () => {
    expect(minorExponent("JPY")).toBe(0);
    expect(toMinorUnits(5000, "JPY")).toBe(5000);
    expect(toMinorUnits(5000.4, "jpy")).toBe(5000);
    expect(fromMinorUnits(5000, "JPY")).toBe(5000);
    expect(toDecimalString(5000, "JPY")).toBe("5000");
  });
  it("KWD: three decimals, rounded to a multiple of 10 so gateways accept it", () => {
    expect(minorExponent("KWD")).toBe(3);
    expect(toMinorUnits(12.345, "KWD") % 10).toBe(0);
    expect(toMinorUnits(12.5, "KWD")).toBe(12500);
    expect(toDecimalString(12500, "KWD")).toBe("12.500");
  });
  it("defaults to two decimals for a missing or unknown currency, and fees.toMinor uses the helper", () => {
    expect(minorExponent(null)).toBe(2);
    expect(minorExponent("XYZ")).toBe(2);
    expect(toMinor(10)).toBe(1000);
    expect(toMinor(1500, "JPY")).toBe(1500);
  });
});

describe("region", () => {
  it("INR = India; any other currency = international", () => {
    expect(regionOf({ currency: "INR" })).toBe("IN");
    expect(regionOf({ currency: "inr" })).toBe("IN");
    for (const c of ["USD", "EUR", "GBP", "AED", "JPY", null, undefined]) expect(regionOf({ currency: c })).toBe("INTL");
  });
  it("a stored country wins over the currency", () => {
    expect(regionOf({ country: "IN", currency: "USD" })).toBe("IN");
    expect(regionOf({ country: "us", currency: "INR" })).toBe("INTL");
    expect(regionOf({ country: "", currency: "INR" })).toBe("IN");
  });
});

describe("gateways are filtered by region, never shown across regions", () => {
  const ids = (r: "IN" | "INTL") => gatewaysForRegion(r).map((g) => g.id).sort();
  it("India: Razorpay, Cashfree, PhonePe, PayU, CCAvenue, Paytm", () => {
    expect(ids("IN")).toEqual(["CASHFREE", "CCAVENUE", "PAYTM", "PAYU", "PHONEPE", "RAZORPAY"]);
  });
  it("International: Stripe and PayPal only", () => {
    expect(ids("INTL")).toEqual(["PAYPAL", "STRIPE"]);
  });
  it("no gateway is in both lists and every gateway is in one", () => {
    for (const g of GATEWAY_LIST) expect(g.regions).toHaveLength(1);
    expect(ids("IN").filter((i) => ids("INTL").includes(i))).toEqual([]);
    expect(ids("IN").length + ids("INTL").length).toBe(GATEWAY_LIST.length);
  });
  it("the server check refuses a gateway from the other region", () => {
    expect(gatewayBlockReason("STRIPE", "IN", "INR")).toMatch(/not available for businesses in India/);
    expect(gatewayBlockReason("PAYPAL", "IN", "INR")).not.toBeNull();
    expect(gatewayBlockReason("RAZORPAY", "INTL", "USD")).toMatch(/not available for international/);
    for (const id of ["PAYU", "CCAVENUE", "PAYTM", "CASHFREE", "PHONEPE"] as const) expect(gatewayBlockReason(id, "INTL", "USD")).not.toBeNull();
    expect(gatewayBlockReason("STRIPE", "INTL", "USD")).toBeNull();
    expect(gatewayBlockReason("PAYU", "IN", "INR")).toBeNull();
  });
  it("PayPal needs a supported currency: AED and KWD are refused, USD and JPY are fine", () => {
    expect(gatewayBlockReason("PAYPAL", "INTL", "AED")).toMatch(/does not support AED/);
    expect(gatewayBlockReason("PAYPAL", "INTL", "KWD")).not.toBeNull();
    for (const c of ["USD", "EUR", "GBP", "JPY"]) expect(gatewayBlockReason("PAYPAL", "INTL", c)).toBeNull();
    expect(gatewayBlockReason("STRIPE", "INTL", "AED")).toBeNull();
  });
  it("every provider card has key guidance with a link and says which webhook events to enable", () => {
    for (const g of GATEWAY_LIST) {
      expect(g.guide.steps.length).toBeGreaterThanOrEqual(2);
      expect(g.guide.links.length).toBeGreaterThan(0);
      for (const l of g.guide.links) expect(l.href).toMatch(/^https:\/\//);
      expect(g.webhook.events.length).toBeGreaterThan(0);
    }
    expect(GATEWAYS.STRIPE.webhook.events).toContain("checkout.session.completed");
    expect(GATEWAYS.PAYPAL.webhook.events).toContain("PAYMENT.CAPTURE.COMPLETED");
    expect(GATEWAYS.STRIPE.guide.steps.join(" ")).toMatch(/restricted key/);
  });
});

const cfg = (over: Partial<PayConfig>): PayConfig => ({
  country: "IN", currency: "INR", platformFeeMinorIN: 1000, hasGateway: false,
  business: { option: "VENUE", advanceKind: "PERCENT", advanceValue: 30 }, overrides: {}, ...over,
});
const svc = [{ serviceId: "s1", price: 100 }];

describe("plan gating, both regions", () => {
  // The entry plan carries the platform fee (1000); paid plans have 0. That one field decides gateways everywhere.
  it("own gateways: paid plans only (fee 0), in both regions", () => {
    expect(canUseOwnGateway({ platformFeeMinorIN: 1000 })).toBe(false);
    expect(canUseOwnGateway({ platformFeeMinorIN: 0 })).toBe(true);
  });
  it("India Basic: only Calvy's Rs 10, no own gateway even if one existed", () => {
    expect(chargeForConfig(cfg({}), svc)).toEqual({ chargeMinor: 1000, platformFeeMinor: 1000, businessShareMinor: 0, route: "CALVY" });
    expect(chargeForConfig(cfg({ hasGateway: true, business: { option: "ONLINE_FULL", advanceKind: "PERCENT", advanceValue: 30 } }), svc).route).toBe("CALVY");
  });
  it("International Free: pay at the venue, no gateway, never a Rs 10 (any currency)", () => {
    for (const currency of ["USD", "EUR", "GBP", "AED", "JPY"]) {
      const c = chargeForConfig(cfg({ country: "US", currency, hasGateway: true, business: { option: "ONLINE_FULL", advanceKind: "PERCENT", advanceValue: 30 } }), svc);
      expect(c).toEqual({ chargeMinor: 0, platformFeeMinor: 0, businessShareMinor: 0, route: "NONE" });
    }
  });
  it("India paid plan: no Rs 10; own gateway takes the venue / full / advance option", () => {
    const paid = { platformFeeMinorIN: 0, hasGateway: true };
    expect(chargeForConfig(cfg({ ...paid }), svc).route).toBe("NONE");
    expect(chargeForConfig(cfg({ ...paid, business: { option: "ONLINE_FULL", advanceKind: "PERCENT", advanceValue: 30 } }), svc)).toEqual({ chargeMinor: 10000, platformFeeMinor: 0, businessShareMinor: 10000, route: "GATEWAY" });
    expect(chargeForConfig(cfg({ ...paid, business: { option: "ADVANCE", advanceKind: "PERCENT", advanceValue: 30 } }), svc).chargeMinor).toBe(3000);
  });
  it("International paid plan: same three options, in the business currency, no conversion", () => {
    const paid = { country: "US", platformFeeMinorIN: 0, hasGateway: true };
    const usd = cfg({ ...paid, currency: "USD", business: { option: "ONLINE_FULL", advanceKind: "PERCENT", advanceValue: 30 } });
    expect(chargeForConfig(usd, [{ serviceId: "s1", price: 49.99 }])).toEqual({ chargeMinor: 4999, platformFeeMinor: 0, businessShareMinor: 4999, route: "GATEWAY" });
    expect(chargeForConfig(cfg({ ...paid, currency: "USD" }), svc).route).toBe("NONE");
    expect(chargeForConfig({ ...usd, business: { option: "ADVANCE", advanceKind: "PERCENT", advanceValue: 25 } }, [{ serviceId: "s1", price: 80 }]).chargeMinor).toBe(2000);
    // fixed advance is in minor units of the currency
    expect(chargeForConfig({ ...usd, business: { option: "ADVANCE", advanceKind: "FIXED", advanceValue: 1500 } }, [{ serviceId: "s1", price: 80 }]).chargeMinor).toBe(1500);
  });
  it("international without a connected gateway pays at the venue", () => {
    expect(chargeForConfig(cfg({ country: "US", currency: "EUR", platformFeeMinorIN: 0, hasGateway: false, business: { option: "ONLINE_FULL", advanceKind: "PERCENT", advanceValue: 30 } }), svc).route).toBe("NONE");
  });
  it("charges per currency: INR, USD, EUR, GBP, AED, JPY", () => {
    const full = { option: "ONLINE_FULL", advanceKind: "PERCENT", advanceValue: 30 } as const;
    const cases: [string, number, number][] = [["INR", 999, 99900], ["USD", 20.5, 2050], ["EUR", 35, 3500], ["GBP", 12.75, 1275], ["AED", 150, 15000], ["JPY", 4800, 4800]];
    for (const [currency, price, minor] of cases) {
      const c = chargeForConfig(cfg({ country: currency === "INR" ? "IN" : "US", currency, platformFeeMinorIN: 0, hasGateway: true, business: full }), [{ serviceId: "s1", price }]);
      expect(c.chargeMinor).toBe(minor);
      expect(c.route).toBe("GATEWAY");
    }
  });
  it("computeCharge directly: international never returns the CALVY route", () => {
    for (const fee of [0, 1000]) {
      const c = computeCharge({ country: "US", platformFeeMinorIN: fee, business: { option: "ONLINE_FULL", advanceKind: "PERCENT", advanceValue: 30 }, hasGateway: true, items: [{ priceMinor: 5000 }] });
      expect(c.route).not.toBe("CALVY");
      expect(c.platformFeeMinor).toBe(0);
    }
  });
});
