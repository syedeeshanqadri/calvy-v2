import { prisma } from "@/lib/prisma";
import { buildTrackingView, signTrackingCode, verifyTrackingCode, type TrackingView } from "@/lib/tracking";
import { safeTimeZone, formatDateLabel, utcToZoned, zonedToUtc } from "@/lib/time";
import { minToHhmm } from "@/lib/tokens";
import type { QueueItem } from "@/lib/queue";
import { meetingUrlFor } from "@/lib/online";

/** Everything the public tracking page needs. Contains no other customer's details. */
export interface TrackingPage {
  business: { name: string; slug: string; logoUrl: string | null; primaryColor: string; packId: string; termsOverride: unknown };
  session: { name: string; dateLabel: string; startTime: string; endTime: string };
  /** The staff member whose queue this is (business information, not customer data). */
  staffName: string | null;
  view: TrackingView;
  /** Wallet credit this booking turned into when it was missed or cancelled (the customer's own money). */
  credit: { amountMinor: number; currency: string } | null;
  /** Online consultation: the signed code is the credential, so the holder of this page may see the link. */
  online: { meetingUrl: string | null } | null;
}

/** Load the tracking page for a signed code (and, when given, the slug it must belong to). */
export async function loadTracking(code: string, slug?: string, now: Date = new Date()): Promise<TrackingPage | null> {
  const id = verifyTrackingCode(code);
  if (!id) return null;

  const a = await prisma.appointment.findUnique({
    where: { id },
    select: {
      id: true, status: true, tokenNumber: true, queuePosition: true, queueState: true, notPresentCount: true, carriedFromId: true,
      estimatedAt: true, sessionDate: true, tokenSessionId: true, isOnline: true,
      service: { select: { meetingUrl: true } }, staff: { select: { meetingUrl: true } },
      business: { select: { name: true, slug: true, logoUrl: true, primaryColor: true, packId: true, termsOverride: true, timezone: true } },
      tokenSession: { select: { name: true, startMin: true, endMin: true, minutesPerToken: true, staff: { select: { name: true } } } },
      carriedTo: { select: { id: true, tokenNumber: true, sessionDate: true } },
    },
  });
  if (!a || !a.tokenSession || !a.tokenSessionId || !a.sessionDate || a.tokenNumber === null) return null;
  if (slug && a.business.slug !== slug) return null;

  const tz = safeTimeZone(a.business.timezone);
  const dateStr = a.sessionDate.toISOString().slice(0, 10);

  // Only queue fields: no names, phones, emails, notes or payment details leave this query.
  const rows = await prisma.appointment.findMany({
    where: {
      tokenSessionId: a.tokenSessionId, sessionDate: a.sessionDate, tokenNumber: { not: null },
      OR: [{ status: { in: ["confirmed", "completed", "no-show"] } }, { status: "cancelled", queueState: { in: ["MOVED", "NO_SHOW", "DONE"] } }],
    },
    select: { id: true, tokenNumber: true, queuePosition: true, queueState: true, notPresentCount: true, carriedFromId: true, servingStartedAt: true },
  });
  const queue: QueueItem[] = rows.map((r) => ({
    id: r.id, tokenNumber: r.tokenNumber ?? 0, position: r.queuePosition, state: r.queueState,
    notPresentCount: r.notPresentCount, carriedFromId: r.carriedFromId,
  }));
  const servingStartedAt = rows.find((r) => r.queueState === "SERVING")?.servingStartedAt ?? null;

  const movedCode = a.carriedTo ? signTrackingCode(a.carriedTo.id) : null;
  const view = buildTrackingView({
    me: {
      id: a.id, tokenNumber: a.tokenNumber, position: a.queuePosition, state: a.queueState,
      notPresentCount: a.notPresentCount, carriedFromId: a.carriedFromId, status: a.status, estimatedAt: a.estimatedAt,
    },
    queue,
    sessionStart: zonedToUtc(dateStr, a.tokenSession.startMin, tz),
    minutesPerToken: a.tokenSession.minutesPerToken,
    servingStartedAt,
    now,
    formatTime: (d) => utcToZoned(d, tz).time,
    movedTo: a.carriedTo && a.carriedTo.sessionDate && movedCode
      ? { dateLabel: formatDateLabel(zonedToUtc(a.carriedTo.sessionDate.toISOString().slice(0, 10), 12 * 60, tz), tz), token: a.carriedTo.tokenNumber ?? 0, code: movedCode }
      : null,
  });

  const credit = ["no_show", "cancelled"].includes(view.state)
    ? await prisma.customerCredit.findFirst({ where: { appointmentId: a.id, kind: { in: ["MISSED", "CANCELLED"] } }, select: { amountMinor: true, currency: true } })
    : null;

  return {
    credit,
    // Only a confirmed booking that is still in the queue: never while payment is pending, or once expired, cancelled, missed or done.
    online: a.isOnline && a.status === "confirmed" && ["waiting", "serving"].includes(view.state) ? { meetingUrl: meetingUrlFor(a) } : null,
    business: {
      name: a.business.name, slug: a.business.slug, logoUrl: a.business.logoUrl, primaryColor: a.business.primaryColor,
      packId: a.business.packId, termsOverride: a.business.termsOverride,
    },
    session: {
      name: a.tokenSession.name, dateLabel: formatDateLabel(zonedToUtc(dateStr, 12 * 60, tz), tz),
      startTime: minToHhmm(a.tokenSession.startMin), endTime: minToHhmm(a.tokenSession.endMin),
    },
    staffName: a.tokenSession.staff?.name ?? null,
    view,
  };
}
