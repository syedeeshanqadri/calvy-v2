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

