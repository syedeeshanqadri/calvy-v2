import { describe, expect, it } from "vitest";
import {
  BAND_TEXT, DEFAULT_LEVEL_CONFIG as CFG, boostedLevel, daysInWindow, earnedLevel, fastTrackReached, hasQuarterlyPerk, heldLevel, levelConfigSchema, levelFee,
  meets, parseLevelConfig, progressToNext, streakMonths, type History, type LevelConfigData,
} from "@/lib/rewards/levels";

const TODAY = "2026-11-20";
const ago = (n: number, from = TODAY) => new Date(Date.parse(`${from}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
/** `count` attended days, one every `step` days, counting back from `end`. */
const dayList = (count: number, step = 1, end = TODAY) => Array.from({ length: count }, (_, i) => ago(i * step, end));
const hist = (days: string[], referralsAttended = 0): History => ({ days, referralsAttended });

describe("windows", () => {
  it("counts only days inside the window, today included", () => {
    expect(daysInWindow([ago(0), ago(89), ago(90)], TODAY, 90)).toBe(2); // 90 days = today and the 89 before
    expect(daysInWindow([ago(0), ago(179), ago(180)], TODAY, 180)).toBe(2);
    expect(daysInWindow([ago(0), ago(0)], TODAY, 90)).toBe(1); // one per day
  });
});

describe("Regular: 7 attended days in 90, or 1 attended referral + 3 visits", () => {
  it("7 days in 90 qualifies, 6 does not", () => {
    expect(earnedLevel(hist(dayList(7, 5)), CFG, TODAY)).toBe("REGULAR");
    expect(earnedLevel(hist(dayList(6, 5)), CFG, TODAY)).toBe("STARTER");
  });
  it("the 7 days must fall inside the 90-day window", () => {
    expect(earnedLevel(hist([...dayList(6, 5), ago(91)]), CFG, TODAY)).toBe("STARTER");
    expect(earnedLevel(hist([...dayList(6, 5), ago(89)]), CFG, TODAY)).toBe("REGULAR");
  });
  it("1 attended referral + 3 visits qualifies; 2 visits, or no referral, does not", () => {
    expect(earnedLevel(hist(dayList(3, 10), 1), CFG, TODAY)).toBe("REGULAR");
    expect(earnedLevel(hist(dayList(2, 10), 1), CFG, TODAY)).toBe("STARTER");
    expect(earnedLevel(hist(dayList(3, 10), 0), CFG, TODAY)).toBe("STARTER");
  });
});

describe("Insider: 14 attended days in 90 + 1 attended referral", () => {
  it("needs both", () => {
    expect(earnedLevel(hist(dayList(14, 5), 1), CFG, TODAY)).toBe("INSIDER");
    expect(earnedLevel(hist(dayList(14, 5), 0), CFG, TODAY)).toBe("REGULAR");
    expect(earnedLevel(hist(dayList(13, 5), 1), CFG, TODAY)).toBe("REGULAR");
  });
});

describe("Pro: 21 days in 180 + 2 referrals + 3 consecutive active months", () => {
  const days = (n: number) => dayList(n, 8); // spread across ~6 months
  it("meets all three", () => expect(earnedLevel(hist(days(21), 2), CFG, TODAY)).toBe("PRO"));
  it("fails without enough referrals, days or consecutive months", () => {
    expect(earnedLevel(hist(days(21), 1), CFG, TODAY)).not.toBe("PRO");
    expect(earnedLevel(hist(days(20), 2), CFG, TODAY)).not.toBe("PRO");
    const gap = [...dayList(11, 4, "2026-11-20"), ...dayList(10, 4, "2026-08-10")]; // Nov and Oct covered, a gap, then Aug
    expect(streakMonths(gap, TODAY)).toBeLessThan(3);
    expect(earnedLevel(hist(gap, 2), CFG, TODAY)).not.toBe("PRO");
  });
});

describe("Legend: 36 days in 180 + 3 referrals + 6 consecutive months (the floor level)", () => {
  const days = dayList(36, 5);
  it("meets all three", () => expect(earnedLevel(hist(days, 3), CFG, TODAY)).toBe("LEGEND"));
  it("2 referrals, or only 5 months, is Pro at most", () => {
    expect(earnedLevel(hist(days, 2), CFG, TODAY)).not.toBe("LEGEND");
    expect(streakMonths(dayList(36, 4), TODAY)).toBeGreaterThanOrEqual(4);
    expect(earnedLevel(hist(dayList(36, 3), 3), CFG, TODAY)).not.toBe("LEGEND"); // all days in the last ~3.5 months
  });
});

describe("active months in a row", () => {
  it("counts back from this month", () => expect(streakMonths(["2026-11-02", "2026-10-15", "2026-09-30"], TODAY)).toBe(3));
  it("is not broken on the 1st: last month counts until this month has a visit", () => expect(streakMonths(["2026-10-15", "2026-09-30"], "2026-11-01")).toBe(2));
  it("a missed month breaks it", () => expect(streakMonths(["2026-11-02", "2026-09-30", "2026-08-01"], TODAY)).toBe(1));
  it("nothing this or last month is 0", () => expect(streakMonths(["2026-08-01"], TODAY)).toBe(0));
  it("crosses a year", () => expect(streakMonths(["2027-01-05", "2026-12-20", "2026-11-03"], "2027-01-20")).toBe(3));
});

describe("fast-track: 10 attended days in one calendar month = +1 level, never above Pro", () => {
  it("10 distinct days in the month reach it; 9 do not; days in other months do not count", () => {
    expect(fastTrackReached(dayList(10, 1, "2026-11-20"), "2026-11-20", CFG)).toBe(true);
    expect(fastTrackReached(dayList(9, 1, "2026-11-20"), "2026-11-20", CFG)).toBe(false);
    expect(fastTrackReached([...dayList(9, 1, "2026-11-20"), "2026-10-31"], "2026-11-20", CFG)).toBe(false);
    expect(fastTrackReached([...dayList(9, 1, "2026-11-20"), "2026-11-20"], "2026-11-20", CFG)).toBe(false); // the same day twice is one day
  });
  it("lifts one level, stops at Pro, and never touches Legend", () => {
    expect(boostedLevel("STARTER", CFG)).toBe("REGULAR");
    expect(boostedLevel("REGULAR", CFG)).toBe("INSIDER");
    expect(boostedLevel("INSIDER", CFG)).toBe("PRO");
    expect(boostedLevel("PRO", CFG)).toBe("PRO");
    expect(boostedLevel("LEGEND", CFG)).toBe("LEGEND");
  });
  it("an admin cannot raise the cap to Legend", () => {
    expect(levelConfigSchema.safeParse({ ...CFG, fastTrack: { daysInMonth: 10, maxLevel: "LEGEND" } }).success).toBe(false);
  });
});

describe("retention: held 90 days after the last visit, then one level per further 90", () => {
  const last = new Date("2026-01-01T00:00:00Z");
  const at = (days: number) => new Date(last.getTime() + days * 86_400_000);
  it("holds for 90 days", () => {
    expect(heldLevel("PRO", last, at(0), 90)).toBe("PRO");
    expect(heldLevel("PRO", last, at(90), 90)).toBe("PRO");
  });
  it("drops one level on day 91, another on day 181, and so on", () => {
    expect(heldLevel("PRO", last, at(91), 90)).toBe("INSIDER");
    expect(heldLevel("PRO", last, at(180), 90)).toBe("INSIDER");
    expect(heldLevel("PRO", last, at(181), 90)).toBe("REGULAR");
    expect(heldLevel("PRO", last, at(271), 90)).toBe("STARTER");
  });
  it("never below Starter, and Starter stays Starter", () => {
    expect(heldLevel("REGULAR", last, at(5000), 90)).toBe("STARTER");
    expect(heldLevel("STARTER", last, at(5000), 90)).toBe("STARTER");
  });
  it("no recorded visit holds the level (a manual set always records one)", () => expect(heldLevel("PRO", null, at(5000), 90)).toBe("PRO"));
  it("uses the retention period an admin sets", () => expect(heldLevel("PRO", last, at(61), 60)).toBe("INSIDER"));
});

describe("fee: levels lower it, the floor is Rs 6, and it never goes up", () => {
  it("each level's fee", () => {
    expect(["STARTER", "REGULAR", "INSIDER", "PRO", "LEGEND"].map((l) => levelFee(l as never, 1000, CFG))).toEqual([1000, 900, 800, 700, 600]);
  });
  it("never below the floor, even if a level is set lower by mistake", () => {
    const low: LevelConfigData = { ...CFG, levels: { ...CFG.levels, LEGEND: { ...CFG.levels.LEGEND, feeMinor: 100 } } };
    expect(levelFee("LEGEND", 1000, low)).toBe(600);
  });
  it("never above the plan's own fee, and no fee where there is none", () => {
    expect(levelFee("REGULAR", 800, CFG)).toBe(800);
    expect(levelFee("LEGEND", 0, CFG)).toBe(0);
    expect(levelFee("STARTER", 0, CFG)).toBe(0);
  });
});

describe("settings are checked", () => {
  it("the defaults are valid and are what a bad row falls back to", () => {
    expect(levelConfigSchema.safeParse(CFG).success).toBe(true);
    expect(parseLevelConfig({ nonsense: true })).toEqual(CFG);
    expect(parseLevelConfig(null)).toEqual(CFG);
  });
  it("rejects a fee below the floor, a higher level costing more, and a way up with no requirement", () => {
    expect(levelConfigSchema.safeParse({ ...CFG, levels: { ...CFG.levels, PRO: { ...CFG.levels.PRO, feeMinor: 500 } } }).success).toBe(false);
    expect(levelConfigSchema.safeParse({ ...CFG, levels: { ...CFG.levels, INSIDER: { ...CFG.levels.INSIDER, feeMinor: 950 } } }).success).toBe(false);
    expect(levelConfigSchema.safeParse({ ...CFG, levels: { ...CFG.levels, REGULAR: { ...CFG.levels.REGULAR, alternatives: [{ days: 0, windowDays: 90, referrals: 0, months: 0 }] } } }).success).toBe(false);
    expect(levelConfigSchema.safeParse({ ...CFG, levels: { ...CFG.levels, REGULAR: { ...CFG.levels.REGULAR, alternatives: [] } } }).success).toBe(false);
  });
  it("thresholds are editable: a different config changes who qualifies", () => {
    const easy: LevelConfigData = { ...CFG, levels: { ...CFG.levels, REGULAR: { feeMinor: 900, alternatives: [{ days: 2, windowDays: 30, referrals: 0, months: 0 }] } } };
    expect(earnedLevel(hist(dayList(2, 5)), easy, TODAY)).toBe("REGULAR");
    expect(earnedLevel(hist(dayList(2, 5)), CFG, TODAY)).toBe("STARTER");
    expect(meets(easy.levels.REGULAR.alternatives[0], hist(dayList(2, 5)), TODAY)).toBe(true);
  });
});

describe("perks and progress", () => {
  it("the quarterly Rs 10 is Pro and Legend only", () => expect(["STARTER", "REGULAR", "INSIDER", "PRO", "LEGEND"].map((l) => hasQuarterlyPerk(l as never))).toEqual([false, false, false, true, true]));
  it("progress grows with effort and never shows a rule", () => {
    const a = progressToNext("STARTER", hist([]), CFG, TODAY);
    const b = progressToNext("STARTER", hist(dayList(6, 5)), CFG, TODAY);
    expect(a).toMatchObject({ next: "REGULAR", ratio: 0, band: "start" });
    expect(b.ratio).toBeGreaterThan(0.8);
    expect(b.band).toBe("close");
    expect(Object.values(BAND_TEXT).every((t) => !/\d/.test(t))).toBe(true); // no thresholds in any phrase
    expect(BAND_TEXT.close).toBe("You're close to your next level.");
  });
  it("the top level has nothing next", () => expect(progressToNext("LEGEND", hist([]), CFG, TODAY)).toMatchObject({ next: null, ratio: 1, band: "top" }));
});
