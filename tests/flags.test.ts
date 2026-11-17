import { describe, it, expect } from "vitest";
import { FEATURE_FLAGS, getFlags, isFeatureEnabled, featureForApiPath, type FeatureFlag } from "@/lib/flags";

const VARS: Record<FeatureFlag, string> = {
  payments: "FEATURE_PAYMENTS",
  chatWidget: "FEATURE_CHAT_WIDGET",
  broadcasts: "FEATURE_BROADCASTS",
  demoBooking: "FEATURE_DEMO_BOOKING",
  removeBranding: "FEATURE_REMOVE_BRANDING",
  onlinePayments: "FEATURE_ONLINE_PAYMENTS",
};

describe("flags", () => {
  it("are all off with an empty env", () => {
    for (const f of FEATURE_FLAGS) expect(isFeatureEnabled(f, {})).toBe(false);
    expect(Object.values(getFlags({})).every((v) => v === false)).toBe(true);
    expect(Object.keys(getFlags({})).sort()).toEqual([...FEATURE_FLAGS].sort());
  });

  it.each(FEATURE_FLAGS)("%s is enabled only by its own variable", (flag) => {
    const flags = getFlags({ [VARS[flag]]: "1" });
    for (const f of FEATURE_FLAGS) expect(flags[f]).toBe(f === flag);
  });

  it.each([["1", true], ["true", true], ["TRUE", true], ["True", true], [" 1 ", true],
    ["0", false], ["false", false], ["", false], ["yes", false], ["on", false], ["2", false]])(
    "parses %j as %s", (value, expected) => {
      expect(isFeatureEnabled("broadcasts", { FEATURE_BROADCASTS: value })).toBe(expected);
    });

  it("ignores undefined values", () => {
    expect(isFeatureEnabled("broadcasts", { FEATURE_BROADCASTS: undefined })).toBe(false);
  });
});

describe("featureForApiPath", () => {
  const table: [string, FeatureFlag | null][] = [
    ["/api/appointments/abc123/payment", "payments"],
    ["/api/broadcasts", "broadcasts"],
    ["/api/broadcasts/send", "broadcasts"],
    ["/api/bookings", null],
    ["/api/availability", null],
    ["/api/auth/providers", null],
    ["/api/auth/session", null],
    ["/api/features", null],
    ["/api/flags", null],
    ["/api/settings", null],
    ["/api/appointments", null],
    ["/api/appointments/abc123", null],
    ["/api/admin/plans", null],
    ["/dashboard", null],
  ];
  it.each(table)("%s -> %s", (path, flag) => {
    expect(featureForApiPath(path)).toBe(flag);
  });

  it("respects path segment boundaries", () => {
    expect(featureForApiPath("/api/broadcastsx")).toBeNull();
    expect(featureForApiPath("/api/appointments//payment")).toBeNull();
  });
});
