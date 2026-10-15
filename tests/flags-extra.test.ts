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
    expect(isFeatureEnabled("wallet", {})).toBe(false);
  });
});

describe("path boundaries", () => {
  it.each([
    ["/api/walletx", null],
    ["/api/wallet/", "wallet"],
    ["/api/wallet?x=1", null], // pathname never contains a query; documents behaviour
    ["/api/WALLET", "wallet"],
    ["/api/Wallet", "wallet"],
    ["/api//wallet", "wallet"],
    ["/api/wallet%2Fx", "wallet"],
    ["/api/wallet.", null],
    ["/api/broadcasts/", "broadcasts"],
    ["/api/billing/status/", "payments"],
    ["/api/billing/statusx", null],
    ["/api/settings/payout/", "payments"],
    ["/api/settings/payoutx", null],
    ["/api/bookings/confirm/", "payments"],
    ["/api/bookings/confirmed", null],
    ["/api/appointments/abc/payment/", "payments"],
    ["/api/appointments/abc/payment/x/y", "payments"],
    ["/api/appointments/abc/paymentx", null],
    ["/api/appointments/a/b/payment", null],
    ["/api/razorpay/connectx", null],
  ] as [string, FeatureFlag | null][])("%s -> %s", (p, f) => {
    expect(featureForApiPath(p)).toBe(f);
  });
});

describe("prefix to flag mapping", () => {
  const map: Record<string, FeatureFlag> = {
    "/api/wallet": "wallet",
    "/api/admin/withdrawals": "wallet",
    "/api/razorpay/connect": "payments",
    "/api/billing/portal": "payments",
    "/api/billing/sync": "payments",
    "/api/billing/upgrade": "payments",
    "/api/billing/status": "payments",
    "/api/settings/payout": "payments",
    "/api/bookings/confirm": "payments",
    "/api/appointments/id1/payment": "payments",
    "/api/broadcasts": "broadcasts",
  };
  it.each(Object.entries(map))("%s maps to exactly %s", (p, f) => {
    expect(featureForApiPath(p)).toBe(f);
    expect(featureForApiPath(p + "/sub")).toBe(f);
  });
  it("only wallet, payments, broadcasts are guarded at the API layer", () => {
    const used = new Set(Object.values(map));
    expect(Array.from(used).sort()).toEqual(["broadcasts", "payments", "wallet"]);
    for (const f of FEATURE_FLAGS) if (!used.has(f)) expect(f).toMatch(/chatWidget|demoBooking|removeBranding/);
  });
});

describe("webhook exemptions", () => {
  it.each([
    "/api/razorpay/webhook", "/api/razorpay/webhook/", "/api/razorpay/webhook/x",
    "/api/billing/webhook", "/api/billing/webhook/", "/api/billing/webhook/x",
  ])("%s is never guarded", (p) => {
    expect(featureForApiPath(p)).toBeNull();
  });
});

describe("non-API paths", () => {
  it.each(["/dashboard/wallet", "/wallet", "/dashboard/broadcasts", "/billing/status", "/", "/dashboard/settings/payout"])(
    "%s -> null", (p) => { expect(featureForApiPath(p)).toBeNull(); });
});

describe("featureForApiPath normalisation", () => {
  it.each([
    "//api//wallet",
    "/api/wallet/",
    "/API/Wallet",
    "/api/%77allet",
    "/api/./wallet",
    "/api/x/../wallet",
    "/api%2Fwallet",
    "/api\\wallet",
    "/api/%2577allet",
  ])("guards %s", (p) => {
    expect(featureForApiPath(p)).toBe("wallet");
  });
  it("does not guard unrelated paths or malformed encodings", () => {
    expect(featureForApiPath("/api/walletx")).toBeNull();
    expect(featureForApiPath("/api/%E0%A4%A")).toBeNull();
  });
});
