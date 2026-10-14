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
