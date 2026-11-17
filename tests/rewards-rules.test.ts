import { describe, expect, it } from "vitest";
import { addDay, availableRewards, countsTowardReward, earnedFor, identityKey, progressLabel, progressView, rewardApplies } from "@/lib/rewards/rules";

describe("identityKey", () => {
  it("prefers the lowercased email, else phone digits", () => {
    expect(identityKey({ email: " Ann@X.com ", phone: "98765 43210" })).toBe("e:ann@x.com");
    expect(identityKey({ email: "", phone: "+91 98765-43210" })).toBe("p:919876543210");
  });
  it("returns null for nothing usable (a short number would be shared by strangers)", () => {
    expect(identityKey({})).toBeNull();
    expect(identityKey({ email: " ", phone: "12345" })).toBeNull();
  });
});

describe("counting", () => {
  it("earns one reward every 7 days, repeating", () => {
    let t = { counted: 0, earned: 0, used: 0 };
    for (let i = 1; i <= 14; i++) {
      t = addDay(t, 7);
      expect(t.earned).toBe(Math.floor(i / 7));
    }
    expect(t.earned).toBe(2);
    expect(earnedFor(6, 7)).toBe(0);
    expect(earnedFor(7, 7)).toBe(1);
    expect(earnedFor(21, 7)).toBe(3);
  });
  it("the 8th booking is the free one: 7 counted, reward ready", () => {
    let t = { counted: 0, earned: 0, used: 0 };
    for (let i = 0; i < 7; i++) t = addDay(t, 7);
    expect(availableRewards(t)).toBe(1);
    expect(progressLabel(progressView(t, 7))).toBe("A free booking is ready");
  });
  it("unused rewards never expire and keep stacking; using one leaves the rest", () => {
    let t = { counted: 0, earned: 0, used: 0 };
    for (let i = 0; i < 14; i++) t = addDay(t, 7);
    expect(availableRewards(t)).toBe(2);
    t = { ...t, used: 1 };
    expect(availableRewards(t)).toBe(1);
    expect(progressLabel(progressView(t, 7))).toBe("A free booking is ready");
  });
  it("shows x of 7 inside the cycle", () => {
    expect(progressView({ counted: 3, earned: 0, used: 0 }, 7)).toEqual({ done: 3, of: 7, available: 0 });
    expect(progressLabel(progressView({ counted: 3, earned: 0, used: 0 }, 7))).toBe("3 of 7 visits toward a free booking");
    expect(progressView({ counted: 9, earned: 1, used: 1 }, 7)).toEqual({ done: 2, of: 7, available: 0 });
  });
});

describe("what counts and where a reward applies", () => {
  it("only completed, non-walk-in bookings count", () => {
    expect(countsTowardReward({ status: "completed", source: "ONLINE" })).toBe(true);
    expect(countsTowardReward({ status: "completed", source: "DASHBOARD" })).toBe(true);
    expect(countsTowardReward({ status: "completed", source: "WALK_IN" })).toBe(false);
    for (const status of ["cancelled", "no-show", "pending", "confirmed", "pending_payment", "expired"]) expect(countsTowardReward({ status, source: "ONLINE" })).toBe(false);
  });
  it("only applies to a booking that would charge Calvy's Rs 10", () => {
    expect(rewardApplies({ route: "CALVY", chargeMinor: 1000, platformFeeMinor: 1000 })).toBe(true);
    expect(rewardApplies({ route: "NONE", chargeMinor: 0, platformFeeMinor: 0 })).toBe(false);
    expect(rewardApplies({ route: "GATEWAY", chargeMinor: 50000, platformFeeMinor: 0 })).toBe(false);
  });
});
