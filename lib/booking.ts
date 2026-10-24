import { zonedToUtc, utcToZoned } from "@/lib/time";
import { occupyingWhere } from "@/lib/holds";

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
  $transaction<R>(fn: (tx: Tx) => Promise<R>, options?: { maxWait?: number; timeout?: number }): Promise<R>;
}

/**
 * The lock transaction runs the availability re-check (several queries) before
 * the write. Prisma's 5 s default is too tight over a remote database: a 5.7 s
 * reschedule was killed with "Transaction already closed" and surfaced as an
 * empty 500. Queries inside a transaction are serial, so allow real headroom.
 */
export const BOOKING_TX_OPTIONS = { maxWait: 10_000, timeout: 20_000 } as const;

/**
 * Conflict check + insert as one unit. Takes a transaction-scoped advisory
 * lock on `staffId ?? businessId`, re-checks the slot, throws SlotConflictError
 * when it is taken, otherwise runs `create` in the same transaction. The lock
 * releases at commit, so concurrent requests for one slot serialise and
 * exactly one wins. Run side effects (email, push) after this resolves.
 *
 * The re-check is `verify` when given (the public path passes the full
 * availability engine), else a plain overlap check scoped to the staff member
 * (unassigned appointments block everyone).
 */
export async function bookExclusive<R, Tx extends BookingTx = BookingTx>(
  db: BookingDb<Tx>,
  p: {
    businessId: string;
    /** Staff member being booked; also the lock key. Null/absent = whole business. */
    staffId?: string | null;
    start: Date;
    durationMin: number;
    capacity: number;
    /** Owner override: skip the conflict check (still serialised). */
    allowOverlap?: boolean;
    /** Appointment being rescheduled; ignored by the default check. */
    excludeId?: string;
    /** Authoritative re-check inside the lock; return false when the slot is not free. */
    verify?: (tx: Tx) => Promise<boolean>;
  },
  create: (tx: Tx) => Promise<R>,
): Promise<R> {
  return db.$transaction(async (tx) => {
    const lockKey = p.staffId ?? p.businessId;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
    if (!p.allowOverlap) {
      if (p.verify) {
        if (!(await p.verify(tx))) throw new SlotConflictError(p.capacity);
      } else {
        const end = new Date(p.start.getTime() + p.durationMin * 60_000);
        const rows = await tx.appointment.findMany({
          where: {
            businessId: p.businessId,
            ...occupyingWhere(),
            date: { lt: end },
            endAt: { gt: p.start },
            ...(p.staffId ? { OR: [{ staffId: p.staffId }, { staffId: null }] } : {}),
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
    }
    return create(tx);
  }, BOOKING_TX_OPTIONS);
}

export function conflictMessage(capacity: number): string {
  return capacity > 1
    ? "This time slot is fully booked. Please choose another."
    : "This time slot is no longer available. Please choose another.";
}

/* ── Availability engine (S2-03/S2-04), pure ───────────────────────── */

export interface Interval {
  start: number; // epoch ms
  end: number;
}

/** An existing appointment as the engine sees it (times in epoch ms). */
export interface BusyAppt {
  start: number;
  end: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  serviceId: string;
}

/** One bookable resource (a staff member, or `null` for a business without staff) for one day. */
export interface ResourceDay {
  id: string | null;
  /** Open windows for the day, minutes since local midnight. */
  hours: { startMin: number; endMin: number }[];
  /** Business and staff time off, merged. */
  timeOff: Interval[];
  /** Non-cancelled appointments that can affect the day (unassigned ones included). */
  busy: BusyAppt[];
  /** Appointments this resource already has that day (the "any available" tie-break). */
  dayBookings: number;
}

export interface SlotOption {
  /** Resources free at this start, in "any available" preference order. */
  resourceIds: (string | null)[];
  /** Spots left for group services (best resource); 1 for individual services. */
  spots: number;
}

export function subtractIntervals(base: Interval[], cut: Interval[]): Interval[] {
  let out = base.filter((i) => i.end > i.start);
  for (const c of cut) {
    const next: Interval[] = [];
    for (const i of out) {
      if (c.end <= i.start || c.start >= i.end) {
        next.push(i);
        continue;
      }
      if (c.start > i.start) next.push({ start: i.start, end: c.start });
      if (c.end < i.end) next.push({ start: c.end, end: i.end });
    }
    out = next;
  }
  return out;
}

/**
 * Bookable start times for one zone day. Services run back to back on one
 * resource; the appointment itself must sit inside a free interval, while
 * buffers only have to clear *other bookings* (they may spill past closing).
 * Steps every `slotInterval` through each free interval. `all` holds every
 * in-window start (taken or not) so callers can show "Taken".
 */
export function computeSlots(p: {
  tz: string;
  date: string; // YYYY-MM-DD in tz
  now: number;
  slotInterval: number;
  minNoticeMinutes: number;
  maxAdvanceDays: number;
  durationMin: number; // total of all requested services
  bufferBeforeMin: number;
  bufferAfterMin: number;
  capacity: number;
  serviceId: string | null;
  resources: ResourceDay[];
}): { all: string[]; available: Map<string, SlotOption> } {
  const step = Number.isFinite(p.slotInterval) && p.slotInterval > 0 ? p.slotInterval : 0;
  if (!step || !(p.durationMin > 0)) return { all: [], available: new Map() };

  const all = new Set<string>();
  const perTime = new Map<string, { id: string | null; sameCount: number; dayBookings: number }[]>();
  const lower = p.now + Math.max(0, p.minNoticeMinutes) * 60_000;
  const upper = p.now + Math.max(0, p.maxAdvanceDays) * 86_400_000;
  const dur = p.durationMin * 60_000;
  const before = Math.max(0, p.bufferBeforeMin) * 60_000;
  const after = Math.max(0, p.bufferAfterMin) * 60_000;
  const group = p.capacity > 1;

  for (const r of p.resources) {
    const open: Interval[] = r.hours.map((h) => ({
      start: zonedToUtc(p.date, h.startMin, p.tz).getTime(),
      end: zonedToUtc(p.date, h.endMin, p.tz).getTime(),
    }));
    const free = subtractIntervals(open, r.timeOff);
    let emitted = 0;
    for (const f of free) {
      for (let t = f.start; t + dur <= f.end && emitted < MAX_SLOTS; t += step * 60_000, emitted++) {
        if (t < lower || t > upper) continue;
        const key = utcToZoned(new Date(t), p.tz).time;
        all.add(key);

        const mineStart = t - before;
        const mineEnd = t + dur + after;
        const isSameGroup = (b: BusyAppt) => group && b.start === t && b.serviceId === p.serviceId;
        const blocked = r.busy.some(
          (b) =>
            !isSameGroup(b) &&
            mineStart < b.end + b.bufferAfterMin * 60_000 &&
            mineEnd > b.start - b.bufferBeforeMin * 60_000,
        );
        if (blocked) continue;
        const sameCount = group ? r.busy.filter(isSameGroup).length : 0;
        if (group && sameCount >= p.capacity) continue;

        const list = perTime.get(key) ?? [];
        list.push({ id: r.id, sameCount, dayBookings: r.dayBookings });
        perTime.set(key, list);
      }
    }
  }

  const available = new Map<string, SlotOption>();
  for (const [key, list] of perTime) {
    // Group services: fill a started group first. Then fewest bookings that day, then id order.
    list.sort(
      (a, b) =>
        (group ? b.sameCount - a.sameCount : 0) ||
        a.dayBookings - b.dayBookings ||
        String(a.id ?? "").localeCompare(String(b.id ?? "")),
    );
    available.set(key, {
      resourceIds: list.map((x) => x.id),
      spots: group ? p.capacity - Math.min(...list.map((x) => x.sameCount)) : 1,
    });
  }
  return { all: Array.from(all).sort(), available };
}
