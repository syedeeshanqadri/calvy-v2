import { describe, expect, it } from "vitest";
import {
  COMEBACK_DAYS, REFERRAL_CAP_PER_MONTH, capReached, hasFreeReschedule, hasQuarterlyPerk, isComeback, isReferralCode, monthOf, needsReview,
  nextTier, quarterOf, referralBlock, tierFor, tierLabel,
} from "@/lib/rewards/ladder";
import { availableRewards } from "@/lib/rewards/rules";

describe("tiers count attended days: Regular 3, Silver 10, Gold 25", () => {
  it("thresholds", () => {
    expect([0, 2, 3, 9, 10, 24, 25, 400].map(tierFor)).toEqual(["NONE", "NONE", "REGULAR", "REGULAR", "SILVER", "SILVER", "GOLD", "GOLD"]);
    expect(tierFor(-5)).toBe("NONE");
    expect(tierLabel("GOLD")).toBe("Gold");
    expect(tierLabel("NONE")).toBe("Not yet");
  });
  it("what is next", () => {
    expect(nextTier(0)).toEqual({ id: "REGULAR", label: "Regular", daysNeeded: 3 });
    expect(nextTier(9)).toEqual({ id: "SILVER", label: "Silver", daysNeeded: 1 });
    expect(nextTier(24)).toEqual({ id: "GOLD", label: "Gold", daysNeeded: 1 });
    expect(nextTier(25)).toBeNull();
  });
  it("perks: free reschedule from Silver, the quarterly Rs 10 only at Gold", () => {
    expect(["NONE", "REGULAR", "SILVER", "GOLD"].map((t) => hasFreeReschedule(t as never))).toEqual([false, false, true, true]);
    expect(["NONE", "REGULAR", "SILVER", "GOLD"].map((t) => hasQuarterlyPerk(t as never))).toEqual([false, false, false, true]);
  });
});

describe("quarters and months", () => {
  it("quarter boundaries", () => {
    expect(quarterOf("2026-01-01")).toBe("2026-Q1");
    expect(quarterOf("2026-03-31")).toBe("2026-Q1");
    expect(quarterOf("2026-04-01")).toBe("2026-Q2");
    expect(quarterOf("2026-12-31")).toBe("2026-Q4");
    expect(() => quarterOf("bad")).toThrow();
  });
  it("month key", () => expect(monthOf(new Date("2026-11-20T10:00:00Z"))).toBe("2026-11"));
});

describe("comeback: attending 1 to 30 days after the previous attended day", () => {
  it("boundaries", () => {
    expect(isComeback("2026-03-01", "2026-03-02")).toBe(true);
    expect(isComeback("2026-03-01", "2026-03-31")).toBe(true);
    expect(isComeback("2026-03-01", "2026-04-01")).toBe(false);
    expect(COMEBACK_DAYS).toBe(30);
  });
  it("not for a first visit, the same day, or a day before", () => {
    expect(isComeback(null, "2026-03-01")).toBe(false);
    expect(isComeback("2026-03-01", "2026-03-01")).toBe(false);
    expect(isComeback("2026-03-05", "2026-03-01")).toBe(false);
  });
});

describe("referral blocks", () => {
  const referrer = { identity: "e:amy@x.com", emails: ["amy@x.com"], phones: ["+91 98765 43210"] };
  const friend = { identity: "e:bob@x.com", email: "bob@x.com", phone: "+91 90000 11111" };
  const ok = { referrer, referred: friend, referredDevice: "dev-b", referrerDevices: ["dev-a"], chain: [] as string[], hadPriorBooking: false };
  it("a clean referral passes", () => expect(referralBlock(ok)).toBeNull());
  it("self-referral: same identity or same email (any case)", () => {
    expect(referralBlock({ ...ok, referred: { ...friend, identity: referrer.identity, email: "amy@x.com" } })).toBe("SELF");
    expect(referralBlock({ ...ok, referred: { ...friend, email: "AMY@x.com" } })).toBe("SELF");
  });
  it("same phone, however it is written", () => {
    expect(referralBlock({ ...ok, referred: { ...friend, phone: "919876543210" } })).toBe("SAME_PHONE");
    expect(referralBlock({ ...ok, referred: { ...friend, phone: "+91-98765-43210" } })).toBe("SAME_PHONE");
    expect(referralBlock({ ...ok, referred: { ...friend, phone: null } })).toBeNull();
  });
  it("same device", () => expect(referralBlock({ ...ok, referredDevice: "dev-a" })).toBe("SAME_DEVICE"));
  it("no device cookie never blocks on its own", () => expect(referralBlock({ ...ok, referredDevice: null })).toBeNull());
  it("a loop: the friend is already above the referrer", () => {
    expect(referralBlock({ ...ok, chain: ["e:bob@x.com"] })).toBe("LOOP");
    expect(referralBlock({ ...ok, chain: ["e:zed@x.com", "e:bob@x.com"] })).toBe("LOOP");
    expect(referralBlock({ ...ok, chain: ["e:zed@x.com"] })).toBeNull();
  });
  it("the friend must be new", () => expect(referralBlock({ ...ok, hadPriorBooking: true })).toBe("NOT_NEW"));
  it("self wins over the other reasons", () => expect(referralBlock({ ...ok, referred: { ...friend, email: "amy@x.com" }, hadPriorBooking: true })).toBe("SELF"));
});

describe("caps and review", () => {
  it("5 rewarded referrals a month is the cap", () => {
    expect(REFERRAL_CAP_PER_MONTH).toBe(5);
    expect(capReached(4)).toBe(false);
    expect(capReached(5)).toBe(true);
  });
  it("more than 5 attempts is flagged for review", () => {
    expect(needsReview(5)).toBe(false);
    expect(needsReview(6)).toBe(true);
  });
  it("codes", () => {
    expect(isReferralCode("ABCD2345")).toBe(true);
    expect(isReferralCode("ABCD234")).toBe(false);
    expect(isReferralCode("ABCD23O5")).toBe(false);
    expect(isReferralCode("abcd2345")).toBe(false);
  });
});

describe("bonus rewards from referrals are spent like earned ones", () => {
  it("available = earned + bonus - used", () => {
    expect(availableRewards({ counted: 0, earned: 0, used: 0, bonus: 1 })).toBe(1);
    expect(availableRewards({ counted: 7, earned: 1, used: 1, bonus: 1 })).toBe(1);
    expect(availableRewards({ counted: 7, earned: 1, used: 5, bonus: 0 })).toBe(0);
  });
});
