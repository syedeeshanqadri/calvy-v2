import { prisma } from "@/lib/prisma";
import { DEFAULT_CURRENCY } from "@/lib/currency";
import { bookingForLabel } from "@/lib/patients";
import { enqueue, type NotificationInput } from "@/lib/notifications/enqueue";
import { alertRecipient } from "@/lib/notifications/business";
import { idempotencyKey } from "@/lib/notifications/policy";
import { SUMMARY_EVENT } from "@/lib/notifications/prefs";
import { serviceLabel } from "@/lib/notifications/events";
import { addDays, formatDateLabel, formatTimeLabel, safeTimeZone, utcToZoned, zonedDayRange } from "@/lib/time";

/**
 * The morning summary goes from 08:00 business time (docs/notifications-design.md, Scheduler step 3). Not after
 * noon: a business that opts in at night, or a scheduler that was down all morning, gets the next day's instead.
 */
export const SUMMARY_MINUTE = 8 * 60;
export const SUMMARY_LAST_MINUTE = 12 * 60;
const MAX_BUSINESSES = 200;
const MAX_UPCOMING = 15;
const UNPAID_HOLDS = ["pending_payment", "expired"];

/** The business's local day whose summary is due now, or null outside 08:00 to 12:00 local time. */
export function summaryDay(now: Date, timeZone: string): string | null {
  const local = utcToZoned(now, safeTimeZone(timeZone));
  return local.minutes >= SUMMARY_MINUTE && local.minutes < SUMMARY_LAST_MINUTE ? local.date : null;
}

/**
 * Queue today's summary for every business that opted in and has reached 08:00. Keyed on business + local
 * date, so it goes once a day however often the scheduler runs; one not sent by the end of that day expires.
 */
export async function enqueueDailySummaries(now: Date = new Date()): Promise<number> {
  const businesses = await prisma.business.findMany({
    where: { notificationPrefs: { path: ["dailySummary"], equals: true } },
    select: { id: true, name: true, timezone: true, currency: true },
    take: MAX_BUSINESSES,
  });
  const due = businesses
    .map((b) => ({ b, day: summaryDay(now, b.timezone) }))
    .filter((x): x is { b: (typeof businesses)[number]; day: string } => !!x.day);
  if (!due.length) return 0;

  const keyFor = (businessId: string, day: string, to: string) =>
    idempotencyKey({ event: SUMMARY_EVENT, subjectId: businessId, version: day, recipient: to, channel: "EMAIL" });
  const withTo = (await Promise.all(due.map(async (x) => ({ ...x, to: await alertRecipient(x.b.id) }))))
    .filter((x): x is typeof x & { to: string } => !!x.to);
  const existing = await prisma.notificationOutbox.findMany({
    where: { idempotencyKey: { in: withTo.map((x) => keyFor(x.b.id, x.day, x.to)) } },
    select: { idempotencyKey: true },
  });
  const known = new Set(existing.map((e) => e.idempotencyKey));
  const fresh = withTo.filter((x) => !known.has(keyFor(x.b.id, x.day, x.to)));

  const items: NotificationInput[] = [];
  for (const { b, day, to } of fresh) items.push(await summaryFor(b, day, to, now));
  if (items.length) await enqueue(prisma, items);
  return items.length;
}

/** Yesterday's numbers and what is still to come today, in the business's own time zone. */
async function summaryFor(b: { id: string; name: string; timezone: string; currency: string | null }, day: string, to: string, now: Date): Promise<NotificationInput> {
  const tz = safeTimeZone(b.timezone);
  const yesterday = zonedDayRange(addDays(day, -1), tz);
  const today = zonedDayRange(day, tz);
  const inYesterday = { gte: yesterday.start, lt: yesterday.end };

  const [created, held, paid, upcoming] = await Promise.all([
    prisma.appointment.count({ where: { businessId: b.id, createdAt: inYesterday, status: { notIn: UNPAID_HOLDS } } }),
    prisma.appointment.groupBy({ by: ["status"], where: { businessId: b.id, date: inYesterday }, _count: { _all: true } }),
    // Revenue counts paid bookings only.
    prisma.appointment.aggregate({ where: { businessId: b.id, date: inYesterday, paymentStatus: "paid" }, _sum: { price: true } }),
    prisma.appointment.findMany({
      where: { businessId: b.id, date: { gte: now > today.start ? now : today.start, lt: today.end }, status: { in: ["confirmed", "pending"] } },
      select: { date: true, notes: true, patientName: true, client: { select: { name: true } }, service: { select: { name: true } } },
      orderBy: { date: "asc" },
      take: MAX_UPCOMING,
    }),
  ]);
  const byStatus = (s: string) => held.find((h) => h.status === s)?._count._all ?? 0;

  return {
    event: SUMMARY_EVENT, audience: "BUSINESS", subjectId: b.id, version: day, recipient: to, template: "daily_summary",
    businessId: b.id, expiresAt: today.end,
    payload: {
      businessName: b.name,
      dateLabel: formatDateLabel(today.start, tz),
      counts: { bookings: created, completed: byStatus("completed"), cancelled: byStatus("cancelled"), noShows: byStatus("no-show") },
      paidTotal: paid._sum.price ?? 0,
      currency: b.currency ?? DEFAULT_CURRENCY,
      upcoming: upcoming.map((a) => ({ time: formatTimeLabel(a.date, tz), clientName: bookingForLabel(a), serviceName: serviceLabel(a.service.name, a.notes) })),
      dashboardUrl: `${(process.env.NEXT_PUBLIC_APP_URL ?? "https://calvy.io").replace(/\/+$/, "")}/dashboard`,
    },
  };
}
