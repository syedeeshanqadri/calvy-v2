import { beforeEach, describe, expect, it, vi } from "vitest";

const sent = vi.hoisted(() => [] as { template: string; recipient: string; payload: Record<string, unknown> }[]);
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/notifications/enqueue", () => ({ notify: async (...items: { template: string; recipient: string; payload: Record<string, unknown> }[]) => { sent.push(...items.filter(Boolean)); } }));

import { adjustLevel, currentLevel, feeForCustomer, getLevelConfig, levelView, lookupLevel, markLevelUpSeen, onAttended, quarterlyPerkReady } from "@/lib/rewards/levelService";
import { DEFAULT_LEVEL_CONFIG } from "@/lib/rewards/levels";
import { levelModels } from "./helpers/levelsFake";

const ID = "e:ann@x.com";
const NOW = new Date("2026-11-20T10:00:00Z");
const ago = (n: number, from = "2026-11-20") => new Date(Date.parse(`${from}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

function fakeDb(o: { config?: unknown; referrals?: { referrer: string; status: string }[]; offerOn?: boolean } = {}) {
  const lv = levelModels({ config: o.config });
  const days: { identity: string; day: string }[] = [];
  const bonus = new Map<string, number>();
  const perks: { identity: string; quarter: string }[] = [];
  const db = {
    ...lv.models,
    offer: { findUnique: async () => ({ id: "o1", enabled: o.offerOn ?? true }) },
    rewardCount: { findMany: async ({ where }: { where: { identity: string; kind: string } }) => days.filter((d) => d.identity === where.identity && where.kind === "VISIT").map((d) => ({ day: d.day })).sort((a, b) => (a.day < b.day ? 1 : -1)) },
    referral: { count: async ({ where }: { where: { referrerIdentity: string; status: { in: string[] } } }) => (o.referrals ?? []).filter((r) => r.referrer === where.referrerIdentity && where.status.in.includes(r.status)).length },
    rewardProgress: { upsert: async ({ where, update }: { where: { offerId_identity: { identity: string } }; update: { bonus: { increment: number } } }) => { const k = where.offerId_identity.identity; bonus.set(k, (bonus.get(k) ?? 0) + update.bonus.increment); } },
    quarterlyPerk: { findUnique: async ({ where }: { where: { identity_quarter: { identity: string; quarter: string } } }) => perks.find((p) => p.identity === where.identity_quarter.identity && p.quarter === where.identity_quarter.quarter) ?? null },
  };
  /** Mark these days attended (the rewards engine adds the row, then calls onAttended for the newest). */
  const attend = async (list: string[], who = ID, now = NOW) => {
    let last: Awaited<ReturnType<typeof onAttended>> = null;
    for (const day of [...list].sort()) {
      if (!days.some((d) => d.identity === who && d.day === day)) days.push({ identity: who, day });
      last = await onAttended(db as never, { identity: who, day, offerId: "o1", now });
    }
    return last;
  };
  return { db: db as never, attend, lv, days, bonus, perks };
}
const spread = (count: number, step: number, end = "2026-11-20") => Array.from({ length: count }, (_, i) => ago(i * step, end));

beforeEach(() => { sent.length = 0; });

describe("earning a level when a visit is marked attended", () => {
  it("7 attended days in 90 makes Regular, with a celebration waiting and an email", async () => {
    const f = fakeDb();
    expect(await f.attend(spread(7, 5))).toBe("REGULAR");
    expect(f.lv.levels.get(ID)).toMatchObject({ level: "REGULAR", pendingLevelUp: "REGULAR" });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ template: "level_up", recipient: "ann@x.com", payload: expect.objectContaining({ level: "REGULAR", levelLabel: "Regular" }) });
  });
  it("6 days is not enough: no level, no email", async () => {
    const f = fakeDb();
    expect(await f.attend(spread(6, 5))).toBe("STARTER");
    expect(f.lv.levels.get(ID)?.pendingLevelUp).toBeNull();
    expect(sent).toHaveLength(0);
  });
  it("Regular needs no perk: the level-up screen and email still come, with no perk text", async () => {
    const f = fakeDb();
    await f.attend(spread(7, 5));
    expect(sent[0].payload.perk).toBeNull();
    expect(f.bonus.get(ID) ?? 0).toBe(0);
  });
  it("Insider: one free booking on level-up, given once even if the level is lost and earned again", async () => {
    const f = fakeDb({ referrals: [{ referrer: ID, status: "REWARDED" }] });
    expect(await f.attend(spread(14, 5))).toBe("INSIDER");
    expect(f.bonus.get(ID)).toBe(1);
    expect(sent.at(-1)?.payload.perk).toContain("free booking");
    // a year of nothing: back to Starter, then earn Insider again later
    const later = new Date("2028-01-01T00:00:00Z");
    expect(await currentLevel(f.db, ID, DEFAULT_LEVEL_CONFIG, later)).toBe("STARTER");
    await f.attend(spread(14, 5, "2028-01-01"), ID, later);
    expect(f.lv.levels.get(ID)?.level).toBe("INSIDER");
    expect(f.bonus.get(ID)).toBe(1); // not twice
    expect(f.lv.grants).toHaveLength(1);
  });
  it("only referrals whose friend attended count: pending and refused ones do not", async () => {
    const f = fakeDb({ referrals: [{ referrer: ID, status: "PENDING" }, { referrer: ID, status: "REJECTED" }] });
    expect(await f.attend(spread(14, 5))).toBe("REGULAR");
  });
  it("a capped referral (the friend did attend) still counts as an attended referral", async () => {
    const f = fakeDb({ referrals: [{ referrer: ID, status: "CAPPED" }] });
    expect(await f.attend(spread(14, 5))).toBe("INSIDER");
  });
  it("never goes down by attending: the held level is kept when the windows are thinner", async () => {
    const f = fakeDb();
    await f.attend(spread(7, 5));
    // 100 days later a single visit: the earned level from the windows would be Starter, but Regular is still held (within 90 days of the last visit)
    const t = new Date("2026-11-20T10:00:00Z");
    await f.attend(["2026-11-21"], ID, new Date(t.getTime() + 86_400_000));
    expect(f.lv.levels.get(ID)?.level).toBe("REGULAR");
  });
  it("each person has their own level", async () => {
    const f = fakeDb();
    await f.attend(spread(7, 5), "e:ann@x.com");
    await f.attend(spread(2, 5), "e:bob@x.com");
    expect(f.lv.levels.get("e:bob@x.com")?.level).toBe("STARTER");
    expect(f.lv.levels.get("e:ann@x.com")?.level).toBe("REGULAR");
  });
  it("a phone-only customer levels up but has no email to send to", async () => {
    const f = fakeDb();
    await f.attend(spread(7, 5), "p:919876543210");
    expect(f.lv.levels.get("p:919876543210")?.level).toBe("REGULAR");
    expect(sent).toHaveLength(0);
  });
});

describe("fast-track: 10 attended days in a calendar month = +1 level (max one a month, never above Pro)", () => {
  const november = Array.from({ length: 10 }, (_, i) => `2026-11-${String(i + 1).padStart(2, "0")}`);
  it("10 days in November: earned Regular (7 days) then boosted to Insider", async () => {
    const f = fakeDb();
    expect(await f.attend(november)).toBe("INSIDER");
    expect(f.lv.boosts).toEqual([{ identity: ID, month: "2026-11" }]);
    expect(f.bonus.get(ID)).toBe(1); // reaching Insider gives the gift
  });
  it("9 days do not trigger it", async () => {
    const f = fakeDb();
    expect(await f.attend(november.slice(0, 9))).toBe("REGULAR");
    expect(f.lv.boosts).toHaveLength(0);
  });
  it("only one boost per calendar month: more attended days in November add none", async () => {
    const f = fakeDb();
    await f.attend(november);
    const eleven = await f.attend(["2026-11-11", "2026-11-12", "2026-11-13"]);
    expect(eleven).toBe("INSIDER");
    expect(f.lv.boosts).toHaveLength(1);
  });
  it("a new month can boost again, up to Pro and no further", async () => {
    const f = fakeDb();
    await f.attend(november);
    const december = Array.from({ length: 10 }, (_, i) => `2026-12-${String(i + 1).padStart(2, "0")}`);
    expect(await f.attend(december, ID, new Date("2026-12-12T10:00:00Z"))).toBe("PRO");
    const january = Array.from({ length: 10 }, (_, i) => `2027-01-${String(i + 1).padStart(2, "0")}`);
    expect(await f.attend(january, ID, new Date("2027-01-12T10:00:00Z"))).toBe("PRO"); // capped: Legend must be fully earned
    expect(f.lv.boosts.map((b) => b.month)).toEqual(["2026-11", "2026-12"]); // a boost that cannot lift is not used up
  });
  it("Legend is only ever earned: fast-track alone cannot reach it", async () => {
    const f = fakeDb({ referrals: [{ referrer: ID, status: "REWARDED" }, { referrer: ID, status: "REWARDED" }] });
    const days = [...spread(30, 3, "2026-12-31")];
    const r = await f.attend(days, ID, new Date("2026-12-31T10:00:00Z"));
    expect(r).not.toBe("LEGEND");
  });
});

describe("retention at read time", () => {
  it("is held for 90 days, then drops one level per 90", async () => {
    const f = fakeDb();
    await f.attend(spread(7, 5)); // Regular, last attended NOW
    const at = (d: number) => new Date(NOW.getTime() + d * 86_400_000);
    expect(await currentLevel(f.db, ID, DEFAULT_LEVEL_CONFIG, at(90))).toBe("REGULAR");
    expect(await currentLevel(f.db, ID, DEFAULT_LEVEL_CONFIG, at(91))).toBe("STARTER");
  });
  it("an unknown person is Starter", async () => expect(await currentLevel(fakeDb().db, ID, DEFAULT_LEVEL_CONFIG)).toBe("STARTER"));
});

describe("the fee at checkout", () => {
  it("Regular pays Rs 9; the floor is Rs 6 for Legend", async () => {
    const f = fakeDb();
    f.lv.levels.set(ID, { identity: ID, level: "REGULAR", levelSince: NOW, lastAttendedAt: NOW, pendingLevelUp: null });
    expect(await feeForCustomer(f.db, { email: "ann@x.com" }, 1000, NOW)).toEqual({ level: "REGULAR", feeMinor: 900 });
    f.lv.levels.set(ID, { identity: ID, level: "LEGEND", levelSince: NOW, lastAttendedAt: NOW, pendingLevelUp: null });
    expect(await feeForCustomer(f.db, { email: "ann@x.com" }, 1000, NOW)).toEqual({ level: "LEGEND", feeMinor: 600 });
  });
  it("uses the level held NOW: an inactive Pro pays the dropped level's fee", async () => {
    const f = fakeDb();
    f.lv.levels.set(ID, { identity: ID, level: "PRO", levelSince: NOW, lastAttendedAt: new Date("2026-01-01T00:00:00Z"), pendingLevelUp: null });
    expect((await feeForCustomer(f.db, { email: "ann@x.com" }, 1000, new Date("2026-04-15T00:00:00Z"))).level).toBe("INSIDER"); // 104 days idle
  });
  it("never applies where there is no Calvy fee: a base fee of 0 stays 0 whatever the level", async () => {
    const f = fakeDb();
    f.lv.levels.set(ID, { identity: ID, level: "LEGEND", levelSince: NOW, lastAttendedAt: NOW, pendingLevelUp: null });
    expect(await feeForCustomer(f.db, { email: "ann@x.com" }, 0, NOW)).toEqual({ level: "STARTER", feeMinor: 0 });
  });
  it("an admin's lower fee setting is applied but never below the floor", async () => {
    const config = { ...DEFAULT_LEVEL_CONFIG, floorMinor: 650, levels: { ...DEFAULT_LEVEL_CONFIG.levels, LEGEND: { ...DEFAULT_LEVEL_CONFIG.levels.LEGEND, feeMinor: 650 } } };
    const f = fakeDb({ config });
    f.lv.levels.set(ID, { identity: ID, level: "LEGEND", levelSince: NOW, lastAttendedAt: NOW, pendingLevelUp: null });
    expect((await feeForCustomer(f.db, { email: "ann@x.com" }, 1000, NOW)).feeMinor).toBe(650);
  });
  it("a broken settings row falls back to the defaults; a failing lookup falls back to the plan fee", async () => {
    expect(await getLevelConfig(fakeDb({ config: { junk: 1 } }).db)).toEqual(DEFAULT_LEVEL_CONFIG);
    const broken = { levelConfig: { findUnique: async () => { throw new Error("down"); } }, customerLevel: { findUnique: async () => { throw new Error("down"); } } } as never;
    expect(await feeForCustomer(broken, { email: "ann@x.com" }, 1000, NOW)).toEqual({ level: "STARTER", feeMinor: 1000 });
  });
  it("no identity means the plain fee", async () => expect(await feeForCustomer(fakeDb().db, {}, 1000, NOW)).toEqual({ level: "STARTER", feeMinor: 1000 }));
});

describe("Pro and Legend: one free Rs 10 per quarter, ending with the quarter", () => {
  it("ready in the quarter, used for the quarter, ready again next quarter", async () => {
    const f = fakeDb();
    expect(await quarterlyPerkReady(f.db, ID, "PRO", NOW)).toBe(true);
    expect(await quarterlyPerkReady(f.db, ID, "LEGEND", NOW)).toBe(true);
    f.perks.push({ identity: ID, quarter: "2026-Q4" });
    expect(await quarterlyPerkReady(f.db, ID, "PRO", NOW)).toBe(false);
    expect(await quarterlyPerkReady(f.db, ID, "PRO", new Date("2026-12-31T17:00:00Z"))).toBe(false); // still Q4 in India
    expect(await quarterlyPerkReady(f.db, ID, "PRO", new Date("2026-12-31T19:00:00Z"))).toBe(true); // 1 Jan 00:30 IST: Q1
  });
  it("not for Starter, Regular or Insider", async () => {
    const f = fakeDb();
    for (const l of ["STARTER", "REGULAR", "INSIDER"] as const) expect(await quarterlyPerkReady(f.db, ID, l, NOW)).toBe(false);
  });
});

describe("the account view never shows the rules", () => {
  it("shows the level, fee, a vague progress phrase and the streak; not thresholds", async () => {
    const f = fakeDb();
    await f.attend(spread(6, 5));
    const v = await levelView(f.db, { email: "ann@x.com" }, NOW);
    expect(v).toMatchObject({ level: "STARTER", label: "Starter", feeMinor: 1000, nextLabel: "Regular" });
    expect(v?.progressText).toBe("You're close to your next level.");
    expect(v?.progressText).not.toMatch(/\d/);
    expect(v?.streakMonths).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(v)).not.toMatch(/windowDays|referrals|alternatives/);
  });
  it("a reached level shows once, then not after it is marked seen", async () => {
    const f = fakeDb();
    await f.attend(spread(7, 5));
    expect((await levelView(f.db, { email: "ann@x.com" }, NOW))?.pendingLevelUp).toEqual({ level: "REGULAR", label: "Regular" });
    await markLevelUpSeen(f.db, { email: "ann@x.com" });
    expect((await levelView(f.db, { email: "ann@x.com" }, NOW))?.pendingLevelUp).toBeNull();
  });
  it("nothing while rewards are off, or without an identity", async () => {
    expect(await levelView(fakeDb({ offerOn: false }).db, { email: "ann@x.com" }, NOW)).toBeNull();
    expect(await levelView(fakeDb().db, {}, NOW)).toBeNull();
  });
});

describe("admin: lookup and manual adjust", () => {
  it("sets the level, restarts retention and reports before and after", async () => {
    const f = fakeDb();
    const r = await adjustLevel(f.db, ID, "PRO", NOW);
    expect(r).toEqual({ before: "STARTER", after: "PRO" });
    expect(f.lv.levels.get(ID)).toMatchObject({ level: "PRO", lastAttendedAt: NOW, pendingLevelUp: null });
    expect(await currentLevel(f.db, ID, DEFAULT_LEVEL_CONFIG, new Date(NOW.getTime() + 90 * 86_400_000))).toBe("PRO");
    expect((await adjustLevel(f.db, ID, "REGULAR", NOW)).before).toBe("PRO");
  });
  it("looks a person up by email or phone", async () => {
    const f = fakeDb();
    await f.attend(spread(7, 5));
    const r = await lookupLevel(f.db, "ANN@x.com", NOW);
    expect(r).toMatchObject({ identity: ID, level: "REGULAR", feeMinor: 900, attendedDaysTotal: 7 });
    expect(await lookupLevel(f.db, "nobody", NOW)).toBeNull();
  });
});
