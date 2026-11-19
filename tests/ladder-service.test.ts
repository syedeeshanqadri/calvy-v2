import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { claimReward, ladderFor, progressFor, recordAttended, releaseReward } from "@/lib/rewards/service";
import { afterBooking, ensureReferralCode, qualifyReferral, referralAdminView } from "@/lib/rewards/referrals";

type Appt = { id: string; status: string; source: string; date: Date; client: { email: string | null; phone: string | null }; business: { timezone: string } };
type Count = { offerId: string; identity: string; day: string; kind?: string; appointmentId: string };
type Prog = { id: string; offerId: string; identity: string; counted: number; earned: number; used: number; bonus: number };
type Ref = { id: string; referrerIdentity: string; referredIdentity: string; status: string; reason: string | null; appointmentId: string | null; createdAt: Date; qualifiedAt: Date | null };

/** In-memory stand-in for every Prisma call the rewards, ladder and referral code makes. */
function fakeDb(o: { enabled?: boolean; prior?: number; clients?: { email: string | null; phone: string | null }[] } = {}) {
  const offer = { id: "o1", key: "LOYALTY_EVERY_8TH", enabled: o.enabled ?? true, every: 7 };
  const appts = new Map<string, Appt>();
  const counts: Count[] = [];
  const progress = new Map<string, Prog>();
  const redemptions: { id: string; offerId: string; identity: string; appointmentId: string }[] = [];
  const referrals: Ref[] = [];
  const codes: { identity: string; code: string }[] = [];
  const devices: { identity: string; deviceHash: string }[] = [];
  const perks: { identity: string; quarter: string; appointmentId: string }[] = [];
  const grants: { identity: string; tier: string }[] = [];
  let n = 0;
  const pk = (w: { offerId_identity: { offerId: string; identity: string } }) => `${w.offerId_identity.offerId}|${w.offerId_identity.identity}`;
  const db: Record<string, unknown> = {
    $executeRaw: async () => 0,
    offer: { findUnique: async () => offer },
    appointment: { findUnique: async ({ where }: { where: { id: string } }) => appts.get(where.id) ?? null, count: async () => o.prior ?? 0 },
    client: { findMany: async () => o.clients ?? [] },
    rewardCount: {
      createMany: async ({ data }: { data: Count[] }) => {
        let c = 0;
        for (const d of data) if (!counts.some((x) => x.identity === d.identity && x.day === d.day)) { counts.push(d); c++; }
        return { count: c };
      },
      findMany: async ({ where }: { where: { identity: string } }) => counts.filter((c) => c.identity === where.identity).map((c) => ({ day: c.day })),
      findFirst: async ({ where }: { where: { identity: string; kind: string; day: { lt: string } } }) =>
        counts.filter((c) => c.identity === where.identity && (c.kind ?? "VISIT") === where.kind && c.day < where.day.lt).sort((a, b) => (a.day < b.day ? 1 : -1))[0] ?? null,
      count: async ({ where }: { where: { identity: string; kind: string } }) => counts.filter((c) => c.identity === where.identity && (c.kind ?? "VISIT") === where.kind).length,
    },
    rewardProgress: {
      findUnique: async ({ where }: { where: { offerId_identity: { offerId: string; identity: string } } }) => progress.get(pk(where)) ?? null,
      upsert: async ({ where, create, update }: { where: { offerId_identity: { offerId: string; identity: string } }; create: Partial<Prog>; update: { counted?: { increment: number }; bonus?: { increment: number } } }) => {
        const cur = progress.get(pk(where));
        if (cur) { cur.counted += update.counted?.increment ?? 0; cur.bonus += update.bonus?.increment ?? 0; return { ...cur }; }
        const row = { id: `p${++n}`, counted: 0, earned: 0, used: 0, bonus: 0, offerId: where.offerId_identity.offerId, identity: where.offerId_identity.identity, ...create } as Prog;
        progress.set(pk(where), row);
        return { ...row };
      },
      update: async ({ where, data }: { where: { id: string }; data: { earned?: number; bonus?: { increment: number } } }) => {
        const r = [...progress.values()].find((p) => p.id === where.id)!;
        if (data.earned !== undefined) r.earned = data.earned;
        if (data.bonus) r.bonus += data.bonus.increment;
        return r;
      },
      updateMany: async ({ where, data }: { where: { id?: string; used?: number | { gt: number }; offerId?: string; identity?: string }; data: { used: { increment?: number; decrement?: number } } }) => {
        const r = [...progress.values()].find((p) => (where.id ? p.id === where.id : p.offerId === where.offerId && p.identity === where.identity));
        if (!r) return { count: 0 };
        if (typeof where.used === "number" && r.used !== where.used) return { count: 0 };
        if (typeof where.used === "object" && !(r.used > where.used.gt)) return { count: 0 };
        r.used += (data.used.increment ?? 0) - (data.used.decrement ?? 0);
        return { count: 1 };
      },
    },
    rewardRedemption: {
      create: async ({ data }: { data: { offerId: string; identity: string; appointmentId: string } }) => { redemptions.push({ id: `r${++n}`, ...data }); },
      findUnique: async ({ where }: { where: { appointmentId: string } }) => redemptions.find((r) => r.appointmentId === where.appointmentId) ?? null,
      deleteMany: async ({ where }: { where: { id: string } }) => { const i = redemptions.findIndex((r) => r.id === where.id); if (i < 0) return { count: 0 }; redemptions.splice(i, 1); return { count: 1 }; },
    },
    tierGrant: {
      createMany: async ({ data }: { data: { identity: string; tier: string }[] }) => {
        let c = 0;
        for (const d of data) if (!grants.some((g) => g.identity === d.identity && g.tier === d.tier)) { grants.push(d); c++; }
        return { count: c };
      },
    },
    quarterlyPerk: {
      findUnique: async ({ where }: { where: { identity_quarter: { identity: string; quarter: string } } }) => perks.find((p) => p.identity === where.identity_quarter.identity && p.quarter === where.identity_quarter.quarter) ?? null,
      createMany: async ({ data }: { data: { identity: string; quarter: string; appointmentId: string }[] }) => {
        let c = 0;
        for (const d of data) if (!perks.some((p) => (p.identity === d.identity && p.quarter === d.quarter) || p.appointmentId === d.appointmentId)) { perks.push(d); c++; }
        return { count: c };
      },
      deleteMany: async ({ where }: { where: { appointmentId: string } }) => { const i = perks.findIndex((p) => p.appointmentId === where.appointmentId); if (i >= 0) perks.splice(i, 1); return { count: i >= 0 ? 1 : 0 }; },
    },
    referralCode: {
      findUnique: async ({ where }: { where: { identity?: string; code?: string } }) => codes.find((c) => (where.identity ? c.identity === where.identity : c.code === where.code)) ?? null,
      createMany: async ({ data }: { data: { identity: string; code: string }[] }) => {
        let c = 0;
        for (const d of data) if (!codes.some((x) => x.identity === d.identity || x.code === d.code)) { codes.push(d); c++; }
        return { count: c };
      },
    },
    deviceSeen: {
      createMany: async ({ data }: { data: { identity: string; deviceHash: string }[] }) => { for (const d of data) if (!devices.some((x) => x.identity === d.identity && x.deviceHash === d.deviceHash)) devices.push(d); return { count: 1 }; },
      findMany: async ({ where }: { where: { identity: string } }) => devices.filter((d) => d.identity === where.identity),
    },
    referral: {
      findUnique: async ({ where }: { where: { referredIdentity: string } }) => referrals.find((r) => r.referredIdentity === where.referredIdentity) ?? null,
      createMany: async ({ data }: { data: Partial<Ref>[] }) => {
        let c = 0;
        for (const d of data) if (!referrals.some((r) => r.referredIdentity === d.referredIdentity)) { referrals.push({ id: `f${++n}`, status: "PENDING", reason: null, appointmentId: null, createdAt: new Date(), qualifiedAt: null, ...d } as Ref); c++; }
        return { count: c };
      },
      count: async ({ where }: { where: { referrerIdentity: string; status: string; qualifiedAt: { gte: Date } } }) => referrals.filter((r) => r.referrerIdentity === where.referrerIdentity && r.status === where.status && r.qualifiedAt && r.qualifiedAt >= where.qualifiedAt.gte).length,
      updateMany: async ({ where, data }: { where: { id: string; status: string }; data: Partial<Ref> }) => {
        const r = referrals.find((x) => x.id === where.id && x.status === where.status);
        if (!r) return { count: 0 };
        Object.assign(r, data);
        return { count: 1 };
      },
      findMany: async () => [...referrals].reverse(),
    },
  };
  db.$transaction = async (fn: (tx: unknown) => unknown) => fn(db);
  const addAppt = (id: string, over: Partial<Appt> = {}, iso = "2026-03-10T08:00:00Z") =>
    appts.set(id, { id, status: "completed", source: "ONLINE", date: new Date(iso), client: { email: "ann@x.com", phone: null }, business: { timezone: "Asia/Kolkata" }, ...over });
  return { db: db as never, addAppt, counts, progress, referrals, codes, devices, perks, redemptions, grants };
}
type F = ReturnType<typeof fakeDb>;
const day = (n: number) => new Date(Date.UTC(2026, 0, 1 + n, 8)).toISOString();
const ann = { email: "ann@x.com" };
async function attend(f: F, id: string, dayOffset: number, over: Partial<Appt> = {}) { f.addAppt(id, over, day(dayOffset)); return recordAttended(f.db, id); }
const counted = (f: F, identity = "e:ann@x.com") => [...f.progress.values()].find((p) => p.identity === identity)?.counted ?? 0;

describe("comeback stamp", () => {
  it("a visit within 30 days of the previous attended day earns an extra stamp", async () => {
    const f = fakeDb();
    await attend(f, "a1", 0);
    expect(counted(f)).toBe(1);
    await attend(f, "a2", 10);
    expect(counted(f)).toBe(3);
  });
  it("at most ONE comeback stamp per calendar month: visits on days 0, 5 and 10 of January earn it once", async () => {
    const f = fakeDb();
    await attend(f, "a1", 0);
    await attend(f, "a2", 5);
    await attend(f, "a3", 10);
    expect(counted(f)).toBe(4); // 3 visits + 1 comeback, not 5
    expect(f.counts.filter((c) => c.kind === "COMEBACK")).toHaveLength(1);
  });
  it("the cap resets next month: a visit in February within 30 days of the last earns it again", async () => {
    const f = fakeDb();
    await attend(f, "a1", 0);   // 1 Jan
    await attend(f, "a2", 5);   // 6 Jan: comeback (January)
    await attend(f, "a3", 10);  // 11 Jan: capped
    await attend(f, "a4", 35);  // 5 Feb, 25 days after 11 Jan: comeback (February)
    expect(counted(f)).toBe(6); // 4 visits + 2 comebacks
    expect(f.counts.filter((c) => c.kind === "COMEBACK").map((c) => c.day)).toEqual(["2026-01~comeback", "2026-02~comeback"]);
  });
  it("the month is India's: a visit at 01:30 IST on 1 February is a February visit even though it is 31 January in UTC", async () => {
    const f = fakeDb();
    f.addAppt("j1", {}, "2026-01-10T08:00:00Z"); await recordAttended(f.db, "j1");
    f.addAppt("j2", {}, "2026-01-20T08:00:00Z"); await recordAttended(f.db, "j2"); // January comeback
    f.addAppt("f1", {}, "2026-01-31T20:00:00Z"); await recordAttended(f.db, "f1"); // 1 Feb IST: a new month, so a new comeback
    expect(f.counts.filter((c) => c.kind === "COMEBACK").map((c) => c.day)).toEqual(["2026-01~comeback", "2026-02~comeback"]);
  });
  it("not after 31 days, and the first visit never earns it", async () => {
    const f = fakeDb();
    await attend(f, "a1", 0);
    await attend(f, "a2", 31);
    expect(counted(f)).toBe(2);
  });
  it("only once per day: a second booking the same day adds nothing", async () => {
    const f = fakeDb();
    await attend(f, "a1", 0);
    await attend(f, "a2", 5);
    const before = counted(f);
    await attend(f, "a3", 5);
    expect(counted(f)).toBe(before);
  });
  it("attended-only: a no-show, cancelled booking or walk-in earns nothing, so no comeback either", async () => {
    const f = fakeDb();
    await attend(f, "a1", 0);
    expect(await attend(f, "a2", 5, { status: "no-show" })).toBe(false);
    expect(await attend(f, "a3", 6, { status: "cancelled" })).toBe(false);
    expect(await attend(f, "a4", 7, { source: "WALK_IN" })).toBe(false);
    expect(counted(f)).toBe(1);
  });
  it("is off when the offer is off", async () => {
    const f = fakeDb({ enabled: false });
    expect(await attend(f, "a1", 0)).toBe(false);
  });
});

describe("Silver: a ONE-TIME free Rs 10 on reaching the tier", () => {
  const bonus = (f: F) => [...f.progress.values()][0]?.bonus ?? 0;
  it("is granted when the 10th attended day is reached, not before", async () => {
    const f = fakeDb();
    for (let i = 0; i < 9; i++) await attend(f, `s${i}`, i * 40);
    expect(bonus(f)).toBe(0);
    expect(f.grants).toHaveLength(0);
    await attend(f, "s9", 9 * 40);
    expect(bonus(f)).toBe(1);
    expect(f.grants).toEqual([{ identity: "e:ann@x.com", tier: "SILVER" }]);
  });
  it("only once: more visits, and reaching Gold, never grant it again", async () => {
    const f = fakeDb();
    for (let i = 0; i < 30; i++) await attend(f, `s${i}`, i * 40);
    expect(bonus(f)).toBe(1);
    expect(f.grants).toHaveLength(1);
  });
  it("is granted once even when a comeback jumps the count over the line (two stamps at once)", async () => {
    const f = fakeDb();
    for (let i = 0; i < 8; i++) await attend(f, `s${i}`, i * 40); // 8 stamps
    await attend(f, "c1", 7 * 40 + 10);   // comeback: 8 -> 10 in one visit
    expect(counted(f)).toBe(10);
    expect(bonus(f)).toBe(1);
  });
  it("is spendable like any reward (it counts as an available free confirmation)", async () => {
    const f = fakeDb();
    for (let i = 0; i < 10; i++) await attend(f, `s${i}`, i * 40);
    // 10 days: floor(10/7) = 1 stamp reward + the Silver gift = 2 ready
    expect((await progressFor(f.db, ann))?.available).toBe(2);
    expect(await claimReward(f.db, { appointmentId: "b1", ...ann })).toBe(true);
    expect(await claimReward(f.db, { appointmentId: "b2", ...ann })).toBe(true);
    expect(await claimReward(f.db, { appointmentId: "b3", ...ann })).toBe(false);
  });
  it("attended-only: no-shows and cancelled bookings never take someone to Silver", async () => {
    const f = fakeDb();
    for (let i = 0; i < 12; i++) await attend(f, `n${i}`, i * 40, { status: i % 2 ? "no-show" : "completed" });
    expect(counted(f)).toBe(6);
    expect(f.grants).toHaveLength(0);
  });
});

describe("tiers and Gold's quarterly perk", () => {
  async function gold(f: F) { for (let i = 0; i < 25; i++) await attend(f, `g${i}`, i * 40); }
  it("shows the tier, what is next and the perks", async () => {
    const f = fakeDb();
    for (let i = 0; i < 10; i++) await attend(f, `s${i}`, i * 40);
    const v = await ladderFor(f.db, ann);
    expect(v).toEqual(expect.objectContaining({ tier: "SILVER", label: "Silver", attendedDays: 10, perkReady: false }));
    expect(v?.perks.join(" ")).toContain("one-time free Rs 10");
    expect(v?.next).toEqual({ label: "Gold", daysNeeded: 15 });
  });
  describe("with Gold", () => {
    beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-20T10:00:00Z")); });
    afterEach(() => vi.useRealTimers());
    it("the extra free Rs 10 is used first, once per quarter, then the stamp rewards", async () => {
      const f = fakeDb();
      await gold(f);
      expect((await ladderFor(f.db, ann))?.perkReady).toBe(true);
      expect((await progressFor(f.db, ann))?.available).toBeGreaterThanOrEqual(1);
      const stampsBefore = [...f.progress.values()][0];
      const usedBefore = stampsBefore.used;
      expect(await claimReward(f.db, { appointmentId: "b1", ...ann })).toBe(true);
      expect(f.perks).toHaveLength(1);
      expect(stampsBefore.used).toBe(usedBefore); // the perk was spent, not a stamp reward
      expect(await claimReward(f.db, { appointmentId: "b2", ...ann })).toBe(true);
      expect(f.perks).toHaveLength(1); // a second perk in the same quarter is refused; a stamp reward is used instead
      expect(stampsBefore.used).toBe(usedBefore + 1);
    });
    it("a cancelled booking gives the perk back", async () => {
      const f = fakeDb();
      await gold(f);
      await claimReward(f.db, { appointmentId: "b1", ...ann });
      await releaseReward(f.db as never, "b1");
      expect(f.perks).toHaveLength(0);
      expect((await ladderFor(f.db, ann))?.perkReady).toBe(true);
    });
    it("expires at quarter end: next quarter a new one is ready", async () => {
      const f = fakeDb();
      await gold(f);
      await claimReward(f.db, { appointmentId: "b1", ...ann });
      expect((await ladderFor(f.db, ann))?.perkReady).toBe(false);
      vi.setSystemTime(new Date("2027-01-02T10:00:00Z"));
      expect((await ladderFor(f.db, ann))?.perkReady).toBe(true);
    });
    it("below Gold there is no perk", async () => {
      const f = fakeDb();
      for (let i = 0; i < 24; i++) await attend(f, `x${i}`, i * 40);
      expect((await ladderFor(f.db, ann))?.perkReady).toBe(false);
      expect(await claimReward(f.db, { appointmentId: "b1", ...ann })).toBe(true); // a normal stamp reward (24 days earned 3)
      expect(f.perks).toHaveLength(0);
    });
  });
});

describe("referral codes", () => {
  it("one code per person, stable", async () => {
    const f = fakeDb();
    const a = await ensureReferralCode(f.db, ann);
    expect(a).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
    expect(await ensureReferralCode(f.db, ann)).toBe(a);
    expect(await ensureReferralCode(f.db, {})).toBeNull();
  });
});

describe("referral: abuse cases", () => {
  async function setup(over: Parameters<typeof fakeDb>[0] = {}) {
    const f = fakeDb(over);
    const code = (await ensureReferralCode(f.db, { email: "amy@x.com" }))!;
    f.addAppt("friend1", { client: { email: "bob@x.com", phone: "+919000011111" } });
    return { f, code };
  }
  it("registers a clean referral as PENDING (nothing is paid at booking)", async () => {
    const { f, code } = await setup();
    expect(await afterBooking(f.db, { appointmentId: "friend1", referralCode: code, deviceHash: "dev-b" })).toBe("registered");
    expect(f.referrals[0]).toEqual(expect.objectContaining({ referrerIdentity: "e:amy@x.com", referredIdentity: "e:bob@x.com", status: "PENDING" }));
    expect([...f.progress.values()]).toHaveLength(0);
  });
  it("self-referral is refused", async () => {
    const { f, code } = await setup();
    f.addAppt("self", { client: { email: "AMY@x.com", phone: null } });
    expect(await afterBooking(f.db, { appointmentId: "self", referralCode: code, deviceHash: null })).toBe("SELF");
    expect(f.referrals[0].status).toBe("REJECTED");
  });
  it("same phone is refused (the referrer's known phones)", async () => {
    const { f, code } = await setup({ clients: [{ email: "amy@x.com", phone: "+919000011111" }] });
    expect(await afterBooking(f.db, { appointmentId: "friend1", referralCode: code, deviceHash: null })).toBe("SAME_PHONE");
  });
  it("same device is refused (a browser the referrer already booked from)", async () => {
    const { f, code } = await setup();
    f.devices.push({ identity: "e:amy@x.com", deviceHash: "dev-shared" });
    expect(await afterBooking(f.db, { appointmentId: "friend1", referralCode: code, deviceHash: "dev-shared" })).toBe("SAME_DEVICE");
  });
  it("a loop is refused: Bob referred Amy, so Amy cannot refer Bob", async () => {
    const { f, code } = await setup();
    f.referrals.push({ id: "old", referrerIdentity: "e:bob@x.com", referredIdentity: "e:amy@x.com", status: "REWARDED", reason: null, appointmentId: null, createdAt: new Date(), qualifiedAt: new Date() });
    expect(await afterBooking(f.db, { appointmentId: "friend1", referralCode: code, deviceHash: null })).toBe("LOOP");
  });
  it("a friend who already booked anywhere on Calvy is not new", async () => {
    const { f, code } = await setup({ prior: 1 });
    expect(await afterBooking(f.db, { appointmentId: "friend1", referralCode: code, deviceHash: null })).toBe("NOT_NEW");
  });
  it("a person can only be referred once (the second referrer gets nothing)", async () => {
    const { f, code } = await setup();
    const other = (await ensureReferralCode(f.db, { email: "cat@x.com" }))!;
    expect(await afterBooking(f.db, { appointmentId: "friend1", referralCode: code, deviceHash: null })).toBe("registered");
    expect(await afterBooking(f.db, { appointmentId: "friend1", referralCode: other, deviceHash: null })).toBe("ALREADY_REFERRED");
    expect(f.referrals).toHaveLength(1);
  });
  it("an unknown or malformed code is ignored without error; the device is still remembered", async () => {
    const { f } = await setup();
    expect(await afterBooking(f.db, { appointmentId: "friend1", referralCode: "ZZZZZZZZ", deviceHash: "d" })).toBe("UNKNOWN_CODE");
    expect(await afterBooking(f.db, { appointmentId: "friend1", referralCode: "nope", deviceHash: "d" })).toBeNull();
    expect(f.devices).toEqual([{ identity: "e:bob@x.com", deviceHash: "d" }]);
  });
  it("does nothing while rewards are switched off", async () => {
    const { f, code } = await setup({ enabled: false });
    expect(await afterBooking(f.db, { appointmentId: "friend1", referralCode: code, deviceHash: null })).toBe("OFF");
    expect(f.referrals).toHaveLength(0);
  });
});

describe("referral reward: only after the friend's first ATTENDED visit", () => {
  async function pending() {
    const f = fakeDb();
    const code = (await ensureReferralCode(f.db, { email: "amy@x.com" }))!;
    f.addAppt("friend1", { client: { email: "bob@x.com", phone: null }, status: "confirmed" });
    await afterBooking(f.db, { appointmentId: "friend1", referralCode: code, deviceHash: null });
    return f;
  }
  const bonus = (f: F, id: string) => [...f.progress.values()].find((p) => p.identity === id)?.bonus ?? 0;

  it("booking or not showing up pays nothing", async () => {
    const f = await pending();
    f.addAppt("friend1", { client: { email: "bob@x.com", phone: null }, status: "no-show" });
    expect(await recordAttended(f.db, "friend1")).toBe(false);
    expect(bonus(f, "e:amy@x.com") + bonus(f, "e:bob@x.com")).toBe(0);
    expect(f.referrals[0].status).toBe("PENDING");
  });
  it("the first attended visit gives BOTH a free Rs 10", async () => {
    const f = await pending();
    f.addAppt("friend1", { client: { email: "bob@x.com", phone: null }, status: "completed" });
    await recordAttended(f.db, "friend1");
    expect(f.referrals[0].status).toBe("REWARDED");
    expect(bonus(f, "e:amy@x.com")).toBe(1);
    expect(bonus(f, "e:bob@x.com")).toBe(1);
    expect((await progressFor(f.db, { email: "bob@x.com" }))?.available).toBe(1);
  });
  it("is paid once, however often it is triggered", async () => {
    const f = await pending();
    f.addAppt("friend1", { client: { email: "bob@x.com", phone: null }, status: "completed" });
    await recordAttended(f.db, "friend1");
    expect(await qualifyReferral(f.db, "o1", "e:bob@x.com")).toBe("none");
    expect(bonus(f, "e:amy@x.com")).toBe(1);
  });
  it("only the FIRST attended visit qualifies: a later visit does not pay a pending referral", async () => {
    const f = fakeDb();
    f.addAppt("v1", { client: { email: "bob@x.com", phone: null } }, day(0));
    await recordAttended(f.db, "v1");
    const code = (await ensureReferralCode(f.db, { email: "amy@x.com" }))!;
    f.referrals.push({ id: "late", referrerIdentity: "e:amy@x.com", referredIdentity: "e:bob@x.com", status: "PENDING", reason: null, appointmentId: null, createdAt: new Date(), qualifiedAt: null });
    f.addAppt("v2", { client: { email: "bob@x.com", phone: null } }, day(50));
    await recordAttended(f.db, "v2");
    expect(code).toBeTruthy();
    expect(f.referrals.find((r) => r.id === "late")?.status).toBe("PENDING");
  });
  it("caps at 5 rewarded referrals per referrer per month; the 6th is kept as CAPPED and pays nothing", async () => {
    const f = fakeDb();
    await ensureReferralCode(f.db, { email: "amy@x.com" });
    const now = new Date("2026-11-20T10:00:00Z");
    for (let i = 0; i < 6; i++) {
      f.referrals.push({ id: `r${i}`, referrerIdentity: "e:amy@x.com", referredIdentity: `e:f${i}@x.com`, status: "PENDING", reason: null, appointmentId: null, createdAt: now, qualifiedAt: null });
    }
    const results: string[] = [];
    for (let i = 0; i < 6; i++) results.push(await qualifyReferral(f.db, "o1", `e:f${i}@x.com`, now));
    expect(results).toEqual(["rewarded", "rewarded", "rewarded", "rewarded", "rewarded", "capped"]);
    expect(bonus(f, "e:amy@x.com")).toBe(5);
    expect(bonus(f, "e:f5@x.com")).toBe(0);
    expect(f.referrals[5]).toEqual(expect.objectContaining({ status: "CAPPED", reason: "MONTHLY_CAP" }));
  });
  it("the cap resets next month", async () => {
    const f = fakeDb();
    for (let i = 0; i < 5; i++) f.referrals.push({ id: `r${i}`, referrerIdentity: "e:amy@x.com", referredIdentity: `e:f${i}@x.com`, status: "REWARDED", reason: null, appointmentId: null, createdAt: new Date("2026-10-05T00:00:00Z"), qualifiedAt: new Date("2026-10-05T00:00:00Z") });
    f.referrals.push({ id: "n", referrerIdentity: "e:amy@x.com", referredIdentity: "e:new@x.com", status: "PENDING", reason: null, appointmentId: null, createdAt: new Date("2026-11-02T00:00:00Z"), qualifiedAt: null });
    expect(await qualifyReferral(f.db, "o1", "e:new@x.com", new Date("2026-11-20T10:00:00Z"))).toBe("rewarded");
  });
});

describe("admin review", () => {
  it("flags referrers with more than 5 attempts this month", async () => {
    const f = fakeDb();
    const now = new Date("2026-11-20T10:00:00Z");
    const mk = (i: number, referrer: string, status = "REJECTED") => f.referrals.push({ id: `r${i}`, referrerIdentity: referrer, referredIdentity: `e:f${i}@x.com`, status, reason: null, appointmentId: null, createdAt: now, qualifiedAt: null });
    for (let i = 0; i < 6; i++) mk(i, "e:spammer@x.com");
    for (let i = 10; i < 15; i++) mk(i, "e:fine@x.com", "PENDING");
    // The fake ignores the month filter, so every row here counts as "this month".
    const v = await referralAdminView(f.db, now);
    expect(v.flagged).toEqual([{ referrer: "spammer@x.com", attempts: 6, rewarded: 0, rejected: 6 }]);
  });
});

describe("Free reschedule is for everyone (source check)", () => {
  it("the customer reschedule flow, open to every customer, moves the same booking and never creates a payment or a new charge", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync("lib/customerAppointments.ts", "utf8");
    const start = src.indexOf("export async function rescheduleByCustomer");
    const body = src.slice(start, src.indexOf("export async function", start + 10) > 0 ? src.indexOf("export async function", start + 10) : undefined);
    expect(body).toMatch(/appointment\.updateMany/);
    expect(body).not.toMatch(/payment\.create|startCheckout|chargeFor|computeCharge/);
    expect(body).not.toMatch(/ladderFor|tierFor|SILVER|GOLD/); // no tier decides it
  });
});
