import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getEffectiveLimits } from "@/lib/getFeatures";
import { sendPushToBusiness } from "@/lib/push";
import { bookingForLabel } from "@/lib/patients";
import type { PlanLimits } from "@/lib/plans";
import { enqueue, type NotificationInput } from "@/lib/notifications/enqueue";
import { noticeFrom, reminder } from "@/lib/notifications/events";
import { idempotencyKey } from "@/lib/notifications/policy";
import { REMINDER_LEADS, resolvePrefs } from "@/lib/notifications/prefs";
import { NO_REMINDER_STATUSES, dueLeads, reminderAnchor, sessionStartOf } from "@/lib/notifications/reminderRules";
import { t } from "@/lib/terms";
import { formatDateLabel, formatTimeLabel, safeTimeZone } from "@/lib/time";

const LONGEST_LEAD_MS = Math.max(...REMINDER_LEADS) * 60_000;
/** A token booking's estimated turn can sit a few hours past its session start; look that far back too. */
const SLACK_MS = 12 * 3_600_000;
const MAX_BOOKINGS = 500;

/**
 * Queue every reminder that is due now (no rows exist before that, so lead changes and moves need no clean-up).
 * Rows already queued are left alone; the owner gets a push for each new one. Sending is the processor's job.
 */
export async function enqueueDueReminders(now: Date = new Date()): Promise<number> {
  const bookings = await prisma.appointment.findMany({
    where: {
      date: { gt: new Date(now.getTime() - SLACK_MS), lte: new Date(now.getTime() + LONGEST_LEAD_MS) },
      // Cutover: the old daily cron set reminderSent; those bookings were already reminded.
      reminderSent: false,
      status: { notIn: NO_REMINDER_STATUSES },
    },
    include: {
      client: { select: { name: true, email: true, phone: true } },
      service: { select: { name: true, meetingUrl: true } },
      staff: { select: { name: true, meetingUrl: true } },
      tokenSession: { select: { name: true, startMin: true } },
      business: {
        select: {
          name: true, slug: true, timezone: true, currency: true, packId: true, termsOverride: true,
          notificationPrefs: true, plan: true, planStatus: true, trialEndsAt: true,
        },
      },
    },
    orderBy: { date: "asc" },
    take: MAX_BOOKINGS,
  });

  const limitsByBusiness = new Map<string, Promise<PlanLimits>>();
  const items: NotificationInput[] = [];
  const pushes = new Map<string, { businessId: string; title: string; body: string; tag: string }>();

  for (const a of bookings) {
    const tz = safeTimeZone(a.business.timezone);
    const anchor = reminderAnchor(a, tz);
    const leads = dueLeads(anchor.at, a.createdAt, resolvePrefs(a.business.notificationPrefs).reminderLeadMinutes, now);
    if (!leads.length) continue;

    if (!limitsByBusiness.has(a.businessId)) limitsByBusiness.set(a.businessId, getEffectiveLimits(a.business));
    const limits = await limitsByBusiness.get(a.businessId)!;
    const session = sessionStartOf(a, tz);
    const notice = noticeFrom(a);

    for (const lead of leads) {
      const r = { mark: { version: anchor.version, lead }, startsAt: anchor.at, sessionStart: session ? formatTimeLabel(session, tz) : undefined };
      const forBooking = [
        limits.emailReminders ? reminder(notice, { ...r, channel: "EMAIL", to: a.client.email }) : null,
        limits.whatsappReminders ? reminder(notice, { ...r, channel: "WHATSAPP", to: a.client.phone }) : null,
      ].filter((n): n is NotificationInput => !!n);
      items.push(...forBooking);
      if (forBooking.length) {
        pushes.set(`${a.id}:${lead}`, {
          businessId: a.businessId,
          title: `${t(a.business, "appointment", { cap: true })} reminder`,
          tag: `reminder-${a.id}`,
          body: `${bookingForLabel(a)}: ${notice.payload.serviceName}, ${formatDateLabel(anchor.at, tz)} at ${formatTimeLabel(anchor.at, tz)}`,
        });
      }
    }
  }
  if (!items.length) return 0;

  // Only what is new: most due reminders were queued by an earlier run.
  const keyOf = (n: NotificationInput) =>
    idempotencyKey({ event: n.event, subjectId: n.subjectId, version: n.version, recipient: n.recipient, channel: n.channel ?? "EMAIL" });
  const existing = await prisma.notificationOutbox.findMany({ where: { idempotencyKey: { in: items.map(keyOf) } }, select: { idempotencyKey: true } });
  const known = new Set(existing.map((e) => e.idempotencyKey));
  const fresh = items.filter((n) => !known.has(keyOf(n)));
  if (!fresh.length) return 0;
  await enqueue(prisma, fresh);

  // The device replaces a notification with the same tag, so a rare double push from overlapping runs shows once.
  const pushed = new Set(fresh.map((n) => `${n.appointmentId}:${(n.payload as { reminder: { lead: number } }).reminder.lead}`));
  await Promise.all(
    [...pushed].map((k) => {
      const p = pushes.get(k);
      return p
        ? sendPushToBusiness(p.businessId, { title: p.title, body: p.body, url: "/dashboard/appointments", tag: p.tag }, { kind: "summary", subjectId: `reminder:${k}`, version: "reminder" })
            .catch((err) => logger.error("reminder push failed", { err }))
        : undefined;
    }),
  );
  return fresh.length;
}
