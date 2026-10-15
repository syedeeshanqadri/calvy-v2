import { describe, it, expect } from "vitest";
import { bookExclusive, SlotConflictError, type BookingTx, type BookingDb } from "@/lib/booking";
import { generateSlots } from "@/lib/booking";

// In-memory stand-in for Postgres: pg_advisory_xact_lock serialises transactions
// per key until the transaction finishes, and reads see only committed rows.
function fakeDb() {
  const rows: { businessId: string; date: Date; duration: number; endAt: Date; status: string; id: string }[] = [];
  const queues = new Map<string, Promise<void>>();
  let n = 0;
  const db: BookingDb<BookingTx & { appointment: { create(a: { data: { businessId?: string; date: Date; duration: number } }): Promise<{ id: string }> } }> = {
    async $transaction(fn) {
      let release!: () => void;
      let myLock: string | null = null;
      const tx = {
        async $executeRaw(_s: TemplateStringsArray, ...v: unknown[]) {
          myLock = String(v[0]);
          const prev = queues.get(myLock) ?? Promise.resolve();
          const mine = new Promise<void>((r) => (release = r));
          queues.set(myLock, prev.then(() => mine));
          await prev;
          return 0;
        },
        appointment: {
          async findMany({ where }: { where: Record<string, any> }) {
            await new Promise((r) => setTimeout(r, 1)); // widen the race window
            return rows
              .filter((r) => r.businessId === where.businessId && r.date < where.date.lt && r.endAt > where.endAt.gt && r.status === "confirmed")
              .map((r) => ({ date: r.date, duration: r.duration }));
          },
          async create({ data }: { data: { businessId?: string; date: Date; duration: number } }) {
            const row = { businessId: "b1", ...data, endAt: new Date(data.date.getTime() + data.duration * 60_000), status: "confirmed", id: `a${++n}` };
            rows.push(row);
            return { id: row.id };
          },
        },
      };
      try {
        return await fn(tx as never);
      } finally {
        release?.();
      }
    },
  };
  return { db, rows };
}

const start = new Date("2026-10-20T05:00:00Z");
const p = { businessId: "b1", start, durationMin: 60, capacity: 1 };

describe("bookExclusive (S2-02)", () => {
  it("20 concurrent requests for one slot: exactly one succeeds", async () => {
    const { db, rows } = fakeDb();
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => bookExclusive(db, p, (tx) => tx.appointment.create({ data: { date: start, duration: 60 } }))),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(rejected).toHaveLength(19);
    expect(rejected.every((r) => r.reason instanceof SlotConflictError)).toBe(true);
    expect(rows).toHaveLength(1);
  });

  it("overlapping but different start is a conflict; adjacent is fine", async () => {
    const { db } = fakeDb();
    const mk = (s: Date) => bookExclusive(db, { ...p, start: s }, (tx) => tx.appointment.create({ data: { date: s, duration: 60 } }));
    await mk(start);
    await expect(mk(new Date(start.getTime() + 30 * 60_000))).rejects.toBeInstanceOf(SlotConflictError);
    await expect(mk(new Date(start.getTime() + 60 * 60_000))).resolves.toBeTruthy();
  });

  it("group capacity: up to capacity at the same start, then full", async () => {
    const { db } = fakeDb();
    const mk = () => bookExclusive(db, { ...p, capacity: 3 }, (tx) => tx.appointment.create({ data: { date: start, duration: 60 } }));
    const res = await Promise.allSettled(Array.from({ length: 6 }, mk));
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(3);
  });

  it("owner allowOverlap skips the check", async () => {
    const { db, rows } = fakeDb();
    const mk = (allowOverlap?: boolean) => bookExclusive(db, { ...p, allowOverlap }, (tx) => tx.appointment.create({ data: { date: start, duration: 60 } }));
    await mk();
    await expect(mk()).rejects.toBeInstanceOf(SlotConflictError);
    await expect(mk(true)).resolves.toBeTruthy();
    expect(rows).toHaveLength(2);
  });

  it("different businesses do not block each other", async () => {
    const { db } = fakeDb();
    const mk = (businessId: string) => bookExclusive(db, { ...p, businessId }, (tx) => tx.appointment.create({ data: { businessId, date: start, duration: 60 } }));
    await expect(Promise.all([mk("b1"), mk("b2")])).resolves.toHaveLength(2);
  });
});

describe("generateSlots bounds (S2-06 regression)", () => {
  it("slotInterval 0, negative, NaN return [] instead of hanging", () => {
    for (const step of [0, -5, NaN, Infinity]) expect(generateSlots("09:00", "18:00", step)).toEqual([]);
  });
  it("never exceeds MAX_SLOTS", () => {
    expect(generateSlots("00:00", "24:00", 1).length).toBeLessThanOrEqual(288);
  });
});
