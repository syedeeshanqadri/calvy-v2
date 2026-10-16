// DB loading for the availability engine (lib/booking.ts computeSlots). Thin on
// purpose: everything that decides a slot lives in the pure engine. Used by
// /api/availability and, inside the booking lock, by /api/bookings.
import type { Prisma, PrismaClient } from "@prisma/client";
import { computeSlots, type BusyAppt, type Interval, type ResourceDay, type SlotOption } from "@/lib/booking";
import { resolveDayHours, type HoursRow } from "@/lib/schedule";
import { safeTimeZone, weekdayOf, zonedDayRange } from "@/lib/time";

type Db = PrismaClient | Prisma.TransactionClient;

export interface AvailabilityQuery {
  businessId: string;
  date: string; // YYYY-MM-DD in the business timezone
  /** Requested services (all must be active and belong to the business). Empty = legacy duration-only query. */
  serviceIds: string[];
  /** Used only when no services are given. */
  fallbackDurationMin?: number;
  /** Limit to one staff member. */
  staffId?: string | null;
  now?: number;
}

export interface AvailabilityResult {
  ok: true;
  tz: string;
  capacity: number;
  durationMin: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  all: string[];
  available: Map<string, SlotOption>;
}
export type AvailabilityOutcome = AvailabilityResult | { ok: false; reason: "business" | "service" };

export async function loadAvailability(db: Db, q: AvailabilityQuery): Promise<AvailabilityOutcome> {
  const business = await db.business.findUnique({
    where: { id: q.businessId },
    select: { timezone: true, slotInterval: true, minNoticeMinutes: true, maxAdvanceDays: true },
  });
  if (!business) return { ok: false, reason: "business" };
  const tz = safeTimeZone(business.timezone);
  const rawInterval = business.slotInterval;
  const slotInterval = Number.isInteger(rawInterval) && rawInterval >= 5 && rawInterval <= 240 ? rawInterval : 30;

  // Requested services, in the requested order.
  let durationMin = q.fallbackDurationMin ?? 30;
  let bufferBeforeMin = 0;
  let bufferAfterMin = 0;
  let capacity = 1;
  let firstServiceId: string | null = null;
  const uniqueIds = Array.from(new Set(q.serviceIds));
  if (uniqueIds.length > 0) {
    const found = await db.service.findMany({ where: { id: { in: uniqueIds }, businessId: q.businessId, isActive: true } });
    if (found.length !== uniqueIds.length) return { ok: false, reason: "service" };
    const ordered = uniqueIds.map((id) => found.find((s) => s.id === id)!);
    durationMin = ordered.reduce((sum, s) => sum + s.duration, 0);
    bufferBeforeMin = ordered[0].bufferBeforeMin;
    bufferAfterMin = ordered[ordered.length - 1].bufferAfterMin;
    capacity = Math.max(1, ordered[0].capacity ?? 1);
    firstServiceId = ordered[0].id;
  }

  const { start: dayStart, end: dayEnd } = zonedDayRange(q.date, tz);
  const weekday = weekdayOf(q.date);

  // Candidate staff: active, linked to ALL requested services. No active staff at all = one shared calendar.
  const activeStaff = await db.staff.findMany({
    where: { businessId: q.businessId, isActive: true },
    select: { id: true, services: { select: { serviceId: true } } },
    orderBy: { id: "asc" },
  });
  const candidates: (string | null)[] =
    activeStaff.length === 0
      ? [null]
      : activeStaff
          .filter((s) => !q.staffId || s.id === q.staffId)
          .filter((s) => uniqueIds.every((id) => s.services.some((l) => l.serviceId === id)))
          .map((s) => s.id);

  const [hoursRows, timeOffRows, appts] = await Promise.all([
    db.workingHours.findMany({ where: { businessId: q.businessId } }),
    db.timeOff.findMany({ where: { businessId: q.businessId, startAt: { lt: dayEnd }, endAt: { gt: dayStart } } }),
    db.appointment.findMany({
      where: {
        businessId: q.businessId,
        status: { notIn: ["cancelled", "no-show"] },
        // a day either side so buffers and overnight neighbours are seen
        date: { gte: new Date(dayStart.getTime() - 86_400_000), lt: new Date(dayEnd.getTime() + 86_400_000) },
      },
      select: { date: true, endAt: true, staffId: true, serviceId: true, bufferBeforeMin: true, bufferAfterMin: true },
    }),
  ]);

  const hours: HoursRow[] = hoursRows.map((h) => ({ staffId: h.staffId, weekday: h.weekday, startMin: h.startMin, endMin: h.endMin }));
  const toBusy = (a: (typeof appts)[number]): BusyAppt => ({
    start: a.date.getTime(),
    end: a.endAt.getTime(),
    bufferBeforeMin: a.bufferBeforeMin,
    bufferAfterMin: a.bufferAfterMin,
    serviceId: a.serviceId,
  });

  const resources: ResourceDay[] = candidates.map((id) => {
    // Unassigned appointments block everyone; a business without staff is blocked by all of them.
    const mine = id === null ? appts : appts.filter((a) => a.staffId === id || a.staffId === null);
    const timeOff: Interval[] = timeOffRows
      .filter((t) => t.staffId === null || t.staffId === id)
      .map((t) => ({ start: t.startAt.getTime(), end: t.endAt.getTime() }));
    return {
      id,
      hours: resolveDayHours(hours, id, weekday),
      timeOff,
      busy: mine.map(toBusy),
      dayBookings: mine.filter((a) => a.date >= dayStart && a.date < dayEnd).length,
    };
  });

  const { all, available } = computeSlots({
    tz,
    date: q.date,
    now: q.now ?? Date.now(),
    slotInterval,
    minNoticeMinutes: business.minNoticeMinutes,
    maxAdvanceDays: business.maxAdvanceDays,
    durationMin,
    bufferBeforeMin,
    bufferAfterMin,
    capacity,
    serviceId: firstServiceId,
    resources,
  });
  return { ok: true, tz, capacity, durationMin, bufferBeforeMin, bufferAfterMin, all, available };
}
