import { describe, it, expect } from "vitest";
import { FEATURE_FLAGS, isFeatureEnabled, featureForApiPath, type FeatureFlag } from "@/lib/flags";

describe("env parsing edge cases", () => {
  it.each([
    ["TRUE", true], ["True", true], [" 1 ", true], ["\t1\n", true], [" true ", true],
    ["0", false], ["false", false], ["FALSE", false], ["", false], ["  ", false],
    ["yes", false], ["1.0", false], ["01", false], ["truee", false],
  ])("FEATURE_PAYMENTS=%j -> %s", (v, expected) => {
    expect(isFeatureEnabled("payments", { FEATURE_PAYMENTS: v })).toBe(expected);
  });
  it("does not read process.env when env is supplied", () => {
    expect(isFeatureEnabled("broadcasts", {})).toBe(false);
  });
});

describe("path boundaries", () => {
  it.each([
    ["/api/BROADCASTS", "broadcasts"],
    ["/api/Broadcasts", "broadcasts"],
    ["/api//broadcasts", "broadcasts"],
    ["/api/broadcasts/", "broadcasts"],
    ["/api/appointments/abc/payment/", "payments"],
    ["/api/appointments/abc/payment/x/y", "payments"],
    ["/api/appointments/abc/paymentx", null],
    ["/api/appointments/a/b/payment", null],
  ] as [string, FeatureFlag | null][])("%s -> %s", (p, f) => {
    expect(featureForApiPath(p)).toBe(f);
  });
});

describe("prefix to flag mapping", () => {
  const map: Record<string, FeatureFlag> = {
    "/api/appointments/id1/payment": "payments",
    "/api/broadcasts": "broadcasts",
  };
  it.each(Object.entries(map))("%s maps to exactly %s", (p, f) => {
    expect(featureForApiPath(p)).toBe(f);
    expect(featureForApiPath(p + "/sub")).toBe(f);
  });
  it("only payments and broadcasts are guarded at the API layer", () => {
    const used = new Set(Object.values(map));
    expect(Array.from(used).sort()).toEqual(["broadcasts", "payments"]);
    for (const f of FEATURE_FLAGS) if (!used.has(f)) expect(f).toMatch(/chatWidget|demoBooking|removeBranding|onlinePayments/);
  });
});

describe("webhook exemptions", () => {
  it.each([
    "/api/payments/webhook/abc", "/api/payments/webhook/abc/", "/api/payments/cashfree/webhook", "/api/whatsapp/webhook",
  ])("%s is never guarded", (p) => {
    expect(featureForApiPath(p)).toBeNull();
  });
});

describe("non-API paths", () => {
  it.each(["/dashboard/broadcasts", "/broadcasts", "/dashboard/broadcasts", "/billing/status", "/"])(
    "%s -> null", (p) => { expect(featureForApiPath(p)).toBeNull(); });
});

describe("featureForApiPath normalisation", () => {
  it.each([
    "//api//broadcasts",
    "/API/Broadcasts",
    "/api/%62roadcasts",
    "/api/./broadcasts",
    "/api/x/../broadcasts",
    "/api%2Fbroadcasts",
    "/api\\broadcasts",
    "/api/%2562roadcasts",
  ])("guards %s", (p) => {
    expect(featureForApiPath(p)).toBe("broadcasts");
  });
  it("does not guard unrelated paths or malformed encodings", () => {
    expect(featureForApiPath("/api/%E0%A4%A")).toBeNull();
  });
});
