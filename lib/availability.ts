// DB loading for the availability engine (lib/booking.ts computeSlots). Thin on
// purpose: everything that decides a slot lives in the pure engine. Used by
// /api/availability, /api/availability/month and, inside the booking lock, by
// /api/bookings.
import type { Prisma, PrismaClient } from "@prisma/client";
import { computeSlots, type BusyAppt, type Interval, type ResourceDay, type SlotOption } from "@/lib/booking";
import { resolveDayHours, type HoursRow } from "@/lib/schedule";
import { addDays, safeTimeZone, utcToZoned, weekdayOf, zonedDayRange } from "@/lib/time";

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

interface ApptRow {
  date: Date;
  endAt: Date;
  staffId: string | null;
  serviceId: string;
  bufferBeforeMin: number;
  bufferAfterMin: number;
}

/** Everything the engine needs for a range of days, loaded once. */
interface Context {
  tz: string;
  slotInterval: number;
  minNoticeMinutes: number;
  maxAdvanceDays: number;
  durationMin: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  capacity: number;
  firstServiceId: string | null;
  candidates: (string | null)[];
  hours: HoursRow[];
  timeOff: { staffId: string | null; startAt: Date; endAt: Date }[];
  appts: ApptRow[];
}

async function buildContext(
  db: Db,
  q: { businessId: string; serviceIds: string[]; fallbackDurationMin?: number; staffId?: string | null },
  range: { firstDate: string; lastDate: string },
): Promise<Context | { error: "business" | "service" }> {
  const business = await db.business.findUnique({
    where: { id: q.businessId },
    select: { timezone: true, slotInterval: true, minNoticeMinutes: true, maxAdvanceDays: true },
  });
  if (!business) return { error: "business" };
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
    if (found.length !== uniqueIds.length) return { error: "service" };
    const ordered = uniqueIds.map((id) => found.find((s) => s.id === id)!);
    durationMin = ordered.reduce((sum, s) => sum + s.duration, 0);
    bufferBeforeMin = ordered[0].bufferBeforeMin;
    bufferAfterMin = ordered[ordered.length - 1].bufferAfterMin;
    capacity = Math.max(1, ordered[0].capacity ?? 1);
    firstServiceId = ordered[0].id;
  }

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

  const rangeStart = zonedDayRange(range.firstDate, tz).start;
  const rangeEnd = zonedDayRange(range.lastDate, tz).end;
  const [hoursRows, timeOffRows, appts] = await Promise.all([
    db.workingHours.findMany({ where: { businessId: q.businessId } }),
    db.timeOff.findMany({ where: { businessId: q.businessId, startAt: { lt: rangeEnd }, endAt: { gt: rangeStart } } }),
    db.appointment.findMany({
      where: {
        businessId: q.businessId,
        status: { notIn: ["cancelled", "no-show"] },
        // a day either side so buffers and overnight neighbours are seen
        date: { gte: new Date(rangeStart.getTime() - 86_400_000), lt: new Date(rangeEnd.getTime() + 86_400_000) },
      },
      select: { date: true, endAt: true, staffId: true, serviceId: true, bufferBeforeMin: true, bufferAfterMin: true },
    }),
  ]);

  return {
    tz,
    slotInterval,
    minNoticeMinutes: business.minNoticeMinutes,
    maxAdvanceDays: business.maxAdvanceDays,
    durationMin,
    bufferBeforeMin,
    bufferAfterMin,
    capacity,
    firstServiceId,
    candidates,
    hours: hoursRows.map((h) => ({ staffId: h.staffId, weekday: h.weekday, startMin: h.startMin, endMin: h.endMin })),
    timeOff: timeOffRows,
    appts,
  };
}

function computeDay(ctx: Context, date: string, now: number) {
  const { start: dayStart, end: dayEnd } = zonedDayRange(date, ctx.tz);
  const weekday = weekdayOf(date);
  const toBusy = (a: ApptRow): BusyAppt => ({
    start: a.date.getTime(),
    end: a.endAt.getTime(),
    bufferBeforeMin: a.bufferBeforeMin,
    bufferAfterMin: a.bufferAfterMin,
    serviceId: a.serviceId,
  });
  const dayWindowStart = dayStart.getTime() - 86_400_000;
  const dayWindowEnd = dayEnd.getTime() + 86_400_000;
  const near = ctx.appts.filter((a) => a.date.getTime() >= dayWindowStart && a.date.getTime() < dayWindowEnd);

  const resources: ResourceDay[] = ctx.candidates.map((id) => {
    // Unassigned appointments block everyone; a business without staff is blocked by all of them.
    const mine = id === null ? near : near.filter((a) => a.staffId === id || a.staffId === null);
    const timeOff: Interval[] = ctx.timeOff
      .filter((t) => (t.staffId === null || t.staffId === id) && t.startAt < dayEnd && t.endAt > dayStart)
      .map((t) => ({ start: t.startAt.getTime(), end: t.endAt.getTime() }));
    return {
      id,
      hours: resolveDayHours(ctx.hours, id, weekday),
      timeOff,
      busy: mine.map(toBusy),
      dayBookings: mine.filter((a) => a.date >= dayStart && a.date < dayEnd).length,
    };
  });

  return computeSlots({
    tz: ctx.tz,
    date,
    now,
    slotInterval: ctx.slotInterval,
    minNoticeMinutes: ctx.minNoticeMinutes,
    maxAdvanceDays: ctx.maxAdvanceDays,
    durationMin: ctx.durationMin,
    bufferBeforeMin: ctx.bufferBeforeMin,
    bufferAfterMin: ctx.bufferAfterMin,
    capacity: ctx.capacity,
    serviceId: ctx.firstServiceId,
    resources,
  });
}

export async function loadAvailability(db: Db, q: AvailabilityQuery): Promise<AvailabilityOutcome> {
  const ctx = await buildContext(db, q, { firstDate: q.date, lastDate: q.date });
  if ("error" in ctx) return { ok: false, reason: ctx.error };
  const { all, available } = computeDay(ctx, q.date, q.now ?? Date.now());
  return {
    ok: true,
    tz: ctx.tz,
    capacity: ctx.capacity,
    durationMin: ctx.durationMin,
    bufferBeforeMin: ctx.bufferBeforeMin,
    bufferAfterMin: ctx.bufferAfterMin,
    all,
    available,
  };
}

export interface MonthAvailability {
  ok: true;
  tz: string;
  /** Every day of the requested month: true when at least one slot is free. */
  days: Record<string, boolean>;
  /** First bookable day on or after the requested month's start, when this month has none. */
  nextAvailable: string | null;
}

const MAX_LOOKAHEAD_MONTHS = 6;

function monthDays(ym: string): string[] {
  const [y, m] = ym.split("-").map(Number);
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: count }, (_, i) => `${ym}-${String(i + 1).padStart(2, "0")}`);
}
function nextMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

/**
 * Which days of a month have a free slot for the chosen services (and staff),
 * loading the data once. If the month has none, scans forward (up to six
 * months) for the next bookable day.
 */
export async function loadMonthAvailability(
  db: Db,
  q: { businessId: string; month: string; serviceIds: string[]; fallbackDurationMin?: number; staffId?: string | null; now?: number },
): Promise<MonthAvailability | { ok: false; reason: "business" | "service" }> {
  const now = q.now ?? Date.now();
  const days = monthDays(q.month);
  const first = await buildContext(db, q, { firstDate: days[0], lastDate: days[days.length - 1] });
  if ("error" in first) return { ok: false, reason: first.error };

  const result: Record<string, boolean> = {};
  for (const d of days) result[d] = computeDay(first, d, now).available.size > 0;

  let nextAvailable: string | null = null;
  if (!Object.values(result).some(Boolean)) {
    // Nothing this month: look ahead, never past the business's advance window.
    const todayZoned = utcToZoned(new Date(now), first.tz).date;
    const horizon = addDays(todayZoned, first.maxAdvanceDays);
    let ym = nextMonth(q.month);
    for (let i = 0; i < MAX_LOOKAHEAD_MONTHS && !nextAvailable; i++, ym = nextMonth(ym)) {
      const list = monthDays(ym);
      if (list[0] > horizon) break;
      const ctx = await buildContext(db, q, { firstDate: list[0], lastDate: list[list.length - 1] });
      if ("error" in ctx) break;
      nextAvailable = list.find((d) => computeDay(ctx, d, now).available.size > 0) ?? null;
    }
  }
  return { ok: true, tz: first.tz, days: result, nextAvailable };
}
