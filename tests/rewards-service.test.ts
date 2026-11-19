import { describe, expect, it } from "vitest";
import { claimReward, lookupProgress, progressFor, recordAttended, releaseReward, rewardAvailable } from "@/lib/rewards/service";

type Appt = { id: string; status: string; source: string; date: Date; client: { email: string | null; phone: string | null }; business: { timezone: string } };

/** In-memory stand-in for the few Prisma calls the rewards service makes. */
function fakeDb(offer: { enabled: boolean; every: number } = { enabled: true, every: 7 }) {
  const appts = new Map<string, Appt>();
  const counts: { offerId: string; identity: string; day: string; kind?: string; appointmentId: string }[] = [];
  const progress = new Map<string, { id: string; offerId: string; identity: string; counted: number; earned: number; used: number; bonus: number }>();
  const redemptions: { id: string; offerId: string; identity: string; appointmentId: string }[] = [];
  const off = { id: "o1", key: "LOYALTY_EVERY_8TH", ...offer };
  let n = 0;
  const pk = (w: { offerId_identity: { offerId: string; identity: string } }) => `${w.offerId_identity.offerId}|${w.offerId_identity.identity}`;
  const db = {
    offer: { findUnique: async () => off },
    appointment: { findUnique: async ({ where }: { where: { id: string } }) => appts.get(where.id) ?? null },
    rewardCount: {
      createMany: async ({ data }: { data: typeof counts }) => {
        let c = 0;
        for (const d of data) if (!counts.some((x) => x.offerId === d.offerId && x.identity === d.identity && x.day === d.day)) { counts.push(d); c++; }
        return { count: c };
      },
      findMany: async ({ where }: { where: { identity: string } }) => counts.filter((c) => c.identity === where.identity).map((c) => ({ day: c.day })),
      findFirst: async ({ where }: { where: { identity: string; kind: string; day: { lt: string } } }) =>
        counts.filter((c) => c.identity === where.identity && (c.kind ?? "VISIT") === where.kind && c.day < where.day.lt).sort((a, b) => (a.day < b.day ? 1 : -1))[0] ?? null,
      count: async ({ where }: { where: { identity: string; kind: string } }) => counts.filter((c) => c.identity === where.identity && (c.kind ?? "VISIT") === where.kind).length,
    },
    referral: { findUnique: async () => null },
    quarterlyPerk: { findUnique: async () => null, createMany: async () => ({ count: 0 }), deleteMany: async () => ({ count: 0 }) },
    rewardProgress: {
      findUnique: async ({ where }: { where: { offerId_identity: { offerId: string; identity: string } } }) => progress.get(pk(where)) ?? null,
      upsert: async ({ where, create, update }: { where: { offerId_identity: { offerId: string; identity: string } }; create: { offerId: string; identity: string; counted: number; earned: number }; update: { counted: { increment: number } } }) => {
        const cur = progress.get(pk(where));
        if (cur) { cur.counted += update.counted.increment; return { ...cur }; }
        const row = { id: `p${++n}`, used: 0, bonus: 0, ...create };
        progress.set(pk(where), row);
        return { ...row };
      },
      update: async ({ where, data }: { where: { id: string }; data: { earned: number } }) => { const r = [...progress.values()].find((p) => p.id === where.id)!; r.earned = data.earned; return r; },
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
      count: async () => redemptions.length,
    },
  };
  const addAppt = (id: string, over: Partial<Appt> = {}, iso = "2026-03-10T08:00:00Z") =>
    appts.set(id, { id, status: "completed", source: "ONLINE", date: new Date(iso), client: { email: "ann@x.com", phone: null }, business: { timezone: "Asia/Kolkata" }, ...over });
  return { db: db as never, addAppt, appts, counts, progress, redemptions };
}

// Visits 40 days apart, so the 30-day comeback stamp (tested separately below) does not apply to the 7-day stamp tests.
const dayIso = (i: number) => new Date(Date.UTC(2025, 0, 10 + i * 40, 8)).toISOString();
const who = { email: "ann@x.com" };

async function attend(f: ReturnType<typeof fakeDb>, days: number) {
  for (let i = 0; i < days; i++) { f.addAppt(`a${i}`, {}, dayIso(i)); await recordAttended(f.db, `a${i}`); }
}

describe("recordAttended", () => {
  it("counts 7 attended days, then the reward is ready", async () => {
    const f = fakeDb();
    await attend(f, 6);
    expect(await rewardAvailable(f.db, who)).toBe(false);
    expect(await progressFor(f.db, who)).toEqual({ done: 6, of: 7, available: 0 });
    await attend(f, 7);
    expect(await progressFor(f.db, who)).toEqual({ done: 0, of: 7, available: 1 });
  });
  it("counts several bookings on the same business-local day once", async () => {
    const f = fakeDb();
    f.addAppt("m", {}, "2026-03-10T04:00:00Z");
    f.addAppt("e", {}, "2026-03-10T12:00:00Z");
    expect(await recordAttended(f.db, "m")).toBe(true);
    expect(await recordAttended(f.db, "e")).toBe(false);
    expect((await progressFor(f.db, who))?.done).toBe(1);
  });
  it("uses the business's own timezone for the day", async () => {
    const f = fakeDb();
    // 20:00Z and 02:00Z next day are the same day in Asia/Kolkata only when they fall inside one local date: 18:30Z is local midnight.
    f.addAppt("x", {}, "2026-03-10T17:00:00Z");
    f.addAppt("y", {}, "2026-03-10T19:00:00Z");
    await recordAttended(f.db, "x"); await recordAttended(f.db, "y");
    // The two business-local days (10 and 11 March) are consecutive, so the second one also earns the comeback stamp: 1 + 2 = 3.
    expect((await progressFor(f.db, who))?.done).toBe(3);
  });
  it("is safe to repeat for one booking", async () => {
    const f = fakeDb();
    f.addAppt("a");
    await recordAttended(f.db, "a"); await recordAttended(f.db, "a");
    expect((await progressFor(f.db, who))?.done).toBe(1);
  });
  it("ignores cancelled, not-attended, pending and walk-in bookings", async () => {
    const f = fakeDb();
    for (const [i, over] of [{ status: "cancelled" }, { status: "no-show" }, { status: "pending" }, { source: "WALK_IN" }].entries()) {
      f.addAppt(`n${i}`, over, dayIso(i));
      expect(await recordAttended(f.db, `n${i}`)).toBe(false);
    }
    expect(await progressFor(f.db, who)).toEqual({ done: 0, of: 7, available: 0 });
  });
  it("falls back to the phone when there is no email, and skips a booking with neither", async () => {
    const f = fakeDb();
    f.addAppt("p", { client: { email: null, phone: "+91 98765 43210" } });
    f.addAppt("z", { client: { email: null, phone: null } }, dayIso(3));
    expect(await recordAttended(f.db, "p")).toBe(true);
    expect(await recordAttended(f.db, "z")).toBe(false);
    expect((await progressFor(f.db, { phone: "9198765 43210" }))?.done).toBe(1);
  });
  it("does nothing while the offer is disabled", async () => {
    const f = fakeDb({ enabled: false, every: 7 });
    f.addAppt("a");
    expect(await recordAttended(f.db, "a")).toBe(false);
    expect(await progressFor(f.db, who)).toBeNull();
  });
});

describe("claim and release", () => {
  it("spends a reward once, and a second booking cannot spend it again", async () => {
    const f = fakeDb();
    await attend(f, 7);
    expect(await claimReward(f.db, { appointmentId: "b1", ...who })).toBe(true);
    expect(await claimReward(f.db, { appointmentId: "b2", ...who })).toBe(false);
    expect((await progressFor(f.db, who))?.available).toBe(0);
  });
  it("cannot be spent before it is earned, or while the offer is disabled", async () => {
    const f = fakeDb();
    await attend(f, 6);
    expect(await claimReward(f.db, { appointmentId: "b1", ...who })).toBe(false);
    const g = fakeDb({ enabled: false, every: 7 });
    expect(await claimReward(g.db, { appointmentId: "b1", ...who })).toBe(false);
  });
  it("gives the reward back when that booking is cancelled, once", async () => {
    const f = fakeDb();
    await attend(f, 7);
    await claimReward(f.db, { appointmentId: "b1", ...who });
    await releaseReward(f.db, "b1");
    await releaseReward(f.db, "b1");
    expect((await progressFor(f.db, who))?.available).toBe(1);
    expect(f.redemptions).toHaveLength(0);
  });
  it("releasing a booking that used no reward changes nothing", async () => {
    const f = fakeDb();
    await attend(f, 7);
    await releaseReward(f.db, "nope");
    expect((await progressFor(f.db, who))?.available).toBe(1);
  });
  it("repeats: a second reward after 14 days, the first one used", async () => {
    const f = fakeDb();
    await attend(f, 14);
    expect((await progressFor(f.db, who))?.available).toBe(2);
    await claimReward(f.db, { appointmentId: "b1", ...who });
    expect((await progressFor(f.db, who))?.available).toBe(1);
  });
});

describe("lookupProgress (admin)", () => {
  it("finds a person by email or phone", async () => {
    const f = fakeDb();
    await attend(f, 3);
    const r = await lookupProgress(f.db, "ANN@x.com");
    expect(r?.counted).toBe(3);
    expect(r?.view).toEqual({ done: 3, of: 7, available: 0 });
    expect(await lookupProgress(f.db, "nobody")).toBeNull();
  });
});
