// Pure, framework-free booking helpers so the rules can be unit tested without
// a database. Times are epoch milliseconds; durations are minutes.

export interface ExistingSlot {
  start: number; // appointment start, epoch ms
  durationMin: number;
}

/** True if the requested time is in the past relative to `now`. */
export function isPastBooking(start: number, now: number = Date.now()): boolean {
  return start < now;
}

/**
 * Capacity-aware conflict check, mirroring the availability endpoint:
 *  - capacity <= 1: any minute-overlap with an existing slot is a conflict.
 *  - capacity  > 1: a conflict only when the number of bookings starting at the
 *    exact same time has reached capacity (group bookings).
 */
export function hasBookingConflict(params: {
  start: number;
  durationMin: number;
  capacity: number;
  existing: ExistingSlot[];
}): boolean {
  const { start, durationMin, capacity, existing } = params;
  const end = start + durationMin * 60_000;

  if (capacity > 1) {
    const sameSlot = existing.filter(e => e.start === start).length;
    return sameSlot >= capacity;
  }

  return existing.some(e => {
    const eEnd = e.start + e.durationMin * 60_000;
    return start < eEnd && e.start < end;
  });
}

/** Hard cap so a bad interval can never produce an unbounded list (24h at 5 min). */
export const MAX_SLOTS = 288;

/** Parse "HH:MM" to minutes since midnight, or null when invalid. */
export function parseHHMM(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59 || (h === 24 && min > 0)) return null;
  return h * 60 + min;
}

/**
 * Slot start times ("HH:MM") from `start` (inclusive) to `end` (exclusive).
 * Returns [] for any invalid input and never more than MAX_SLOTS entries.
 */
export function generateSlots(start: string, end: string, stepMin: number): string[] {
  if (typeof stepMin !== "number" || !Number.isFinite(stepMin) || stepMin <= 0) return [];
  const startMin = parseHHMM(start);
  const endMin = parseHHMM(end);
  if (startMin === null || endMin === null || endMin <= startMin) return [];
  const slots: string[] = [];
  let cur = startMin;
  while (cur < endMin && slots.length < MAX_SLOTS) {
    const h = Math.floor(cur / 60).toString().padStart(2, "0");
    const m = Math.floor(cur % 60).toString().padStart(2, "0");
    slots.push(`${h}:${m}`);
    cur += stepMin;
  }
  return slots;
}


/* ── Atomic booking (S2-02) ───────────────────────────────────────── */

/** Thrown inside the transaction when the slot is taken; routes map it to 409. */
export class SlotConflictError extends Error {
  constructor(public readonly capacity: number) {
    super("slot conflict");
    this.name = "SlotConflictError";
  }
}

/** The slice of a Prisma transaction client the booking lock needs (fakeable in tests). */
export interface BookingTx {
  $executeRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<number>;
  appointment: {
    findMany(args: {
      where: Record<string, unknown>;
      select: { date: true; duration: true };
    }): Promise<{ date: Date; duration: number }[]>;
  };
}
export interface BookingDb<Tx extends BookingTx = BookingTx> {
  $transaction<R>(fn: (tx: Tx) => Promise<R>): Promise<R>;
}

/**
 * Conflict check + insert as one unit. Takes a transaction-scoped advisory
 * lock, re-reads the overlapping appointments, throws SlotConflictError when
 * the slot is taken, otherwise runs `create` in the same transaction. The lock
 * is per business (the conflict rule is business-wide today); it releases at
 * commit, so concurrent requests for one slot serialise and exactly one wins.
 * Run side effects (email, push) after this resolves.
 */
export async function bookExclusive<R, Tx extends BookingTx = BookingTx>(
  db: BookingDb<Tx>,
  p: {
    businessId: string;
    start: Date;
    durationMin: number;
    capacity: number;
    /** Owner override: skip the conflict check (still serialised). */
    allowOverlap?: boolean;
    /** Appointment being rescheduled; ignored by the check. */
    excludeId?: string;
  },
  create: (tx: Tx) => Promise<R>,
): Promise<R> {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${p.businessId}, 0))`;
    if (!p.allowOverlap) {
      const end = new Date(p.start.getTime() + p.durationMin * 60_000);
      const rows = await tx.appointment.findMany({
        where: {
          businessId: p.businessId,
          status: { notIn: ["cancelled", "no-show"] },
          date: { lt: end },
          endAt: { gt: p.start },
          ...(p.excludeId ? { id: { not: p.excludeId } } : {}),
        },
        select: { date: true, duration: true },
      });
      const conflict = hasBookingConflict({
        start: p.start.getTime(),
        durationMin: p.durationMin,
        capacity: p.capacity,
        existing: rows.map((r) => ({ start: r.date.getTime(), durationMin: r.duration })),
      });
      if (conflict) throw new SlotConflictError(p.capacity);
    }
    return create(tx);
  });
}

export function conflictMessage(capacity: number): string {
  return capacity > 1
    ? "This time slot is fully booked. Please choose another."
    : "This time slot is no longer available. Please choose another.";
}
