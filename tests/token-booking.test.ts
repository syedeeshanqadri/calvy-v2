import { describe, it, expect } from "vitest";
import { assignToken, findNextOpen, issueToken, tokensLeft, type SessionLike, type TokenStore } from "@/lib/tokens";

const base = { startMin: 600, endMin: 840, minutesPerToken: 15 }; // 10:00-14:00, 16 tokens
const mk = (o: Partial<SessionLike> & { id: string }): SessionLike & { id: string } => ({
  name: "Morning", staffId: null, weekdays: [0, 1, 2, 3, 4, 5, 6], isActive: true, ...base, ...o,
});

describe("numbering and ETA", () => {
  it("starts at 1 at the session start", () => {
    expect(assignToken(base, 0)).toEqual({ number: 1, estimatedMin: 600 });
  });
  it("estimatedAt = start + (n-1) x minutes (token 12 -> 12:45)", () => {
    expect(assignToken(base, 11)).toEqual({ number: 12, estimatedMin: 600 + 11 * 15 });
  });
  it("last token is capacity, the next is refused", () => {
    expect(assignToken(base, 15)?.number).toBe(16);
    expect(assignToken(base, 16)).toBeNull();
  });
  it("never reuses numbers: capacity counts every number issued", () => {
    // 16 issued then some cancelled: the last number is still 16, so still full.
    expect(tokensLeft(base, 16)).toBe(0);
    expect(tokensLeft(base, 4)).toBe(12);
  });
});

/** In-memory store: a promise-chain mutex per key emulates pg_advisory_xact_lock; awaits expose races. */
function memoryStore() {
  const rows: { sessionId: string; date: string; n: number }[] = [];
  const tails = new Map<string, Promise<unknown>>();
  const tick = () => new Promise<void>((r) => setTimeout(r, Math.random() * 3));
  const store: TokenStore<{ sessionId: string; date: string }> = {
    async run(key, fn) {
      const [, sessionId, date] = key.split(":");
      const prev = tails.get(key) ?? Promise.resolve();
      const result = prev.then(() => fn({ sessionId, date }));
      tails.set(key, result.catch(() => undefined));
      return result;
    },
    async lastNumber(tx) {
      await tick();
      return Math.max(0, ...rows.filter((r) => r.sessionId === tx.sessionId && r.date === tx.date).map((r) => r.n));
    },
  };
  const write = async (tx: { sessionId: string; date: string }, a: { number: number }) => {
    await tick();
    rows.push({ sessionId: tx.sessionId, date: tx.date, n: a.number });
    return a.number;
  };
  return { store, write, rows };
}

describe("issueToken", () => {
  it("10 parallel bookings get unique, consecutive tokens", async () => {
    const { store, write } = memoryStore();
    const s = mk({ id: "s1" });
    const res = await Promise.all(Array.from({ length: 10 }, () => issueToken(store, s, "2026-10-26", write)));
    const nums = res.map((r) => (r.ok ? r.value : -1)).sort((a, b) => a - b);
    expect(nums).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("rejects once full, even under parallel load", async () => {
    const { store, write, rows } = memoryStore();
    const s = mk({ id: "s1", startMin: 600, endMin: 660 }); // 4 tokens
    const res = await Promise.all(Array.from({ length: 10 }, () => issueToken(store, s, "2026-10-26", write)));
    expect(res.filter((r) => r.ok)).toHaveLength(4);
    expect(res.filter((r) => !r.ok)).toHaveLength(6);
    expect(rows.map((r) => r.n).sort()).toEqual([1, 2, 3, 4]);
  });

  it("per-staff sessions and different days number independently", async () => {
    const { store, write } = memoryStore();
    const a = mk({ id: "dr-a-morning", staffId: "a" });
    const b = mk({ id: "dr-b-morning", staffId: "b" });
    const res = await Promise.all([
      issueToken(store, a, "2026-10-26", write), issueToken(store, b, "2026-10-26", write),
      issueToken(store, a, "2026-10-26", write), issueToken(store, b, "2026-10-26", write),
      issueToken(store, a, "2026-10-27", write),
    ]);
    const key = (i: number) => (res[i].ok ? (res[i] as { value: number }).value : -1);
    expect([key(0), key(2)].sort()).toEqual([1, 2]);
    expect([key(1), key(3)].sort()).toEqual([1, 2]);
    expect(key(4)).toBe(1);
  });

  it("the ETA follows the number", async () => {
    const { store, write } = memoryStore();
    const s = mk({ id: "s1" });
    await issueToken(store, s, "2026-10-26", write);
    const r = await issueToken(store, s, "2026-10-26", write);
    expect(r.ok && r.assignment).toEqual({ number: 2, estimatedMin: 615 });
  });
});

describe("findNextOpen", () => {
  const morning = mk({ id: "m" });
  const evening = mk({ id: "e", name: "Evening", startMin: 1020, endMin: 1200 });
  const common = { sessions: [morning, evening], queueStaffId: null, days: 14, nowMin: null as number | null };

  it("suggests the evening session when the morning is full", () => {
    const r = findNextOpen({ ...common, startDate: "2026-10-26", lastNumbers: { "m|2026-10-26": 16 }, skipId: "m" });
    expect(r).toMatchObject({ date: "2026-10-26", session: { id: "e" } });
  });
  it("moves to the next day when the whole day is full", () => {
    const r = findNextOpen({ ...common, startDate: "2026-10-26", lastNumbers: { "m|2026-10-26": 16, "e|2026-10-26": 12 } });
    expect(r).toMatchObject({ date: "2026-10-27", session: { id: "m" } });
  });
  it("skips sessions that already ended today", () => {
    const r = findNextOpen({ ...common, startDate: "2026-10-26", lastNumbers: {}, nowMin: 900 });
    expect(r?.session.id).toBe("e");
  });
  it("only looks inside the same queue", () => {
    const docA = mk({ id: "a", staffId: "a" });
    const docB = mk({ id: "b", staffId: "b" });
    const r = findNextOpen({ sessions: [docA, docB], queueStaffId: "b", startDate: "2026-10-26", days: 3, lastNumbers: {}, nowMin: null });
    expect(r?.session.id).toBe("b");
  });
  it("returns null when nothing is open in the window", () => {
    expect(findNextOpen({ ...common, days: 2, startDate: "2026-10-26", lastNumbers: { "m|2026-10-26": 16, "e|2026-10-26": 12, "m|2026-10-27": 16, "e|2026-10-27": 12 } })).toBeNull();
  });
});
