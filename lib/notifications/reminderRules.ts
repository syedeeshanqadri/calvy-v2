import type { NotificationOutbox } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolvePrefs } from "@/lib/notifications/prefs";
import { safeTimeZone, zonedToUtc } from "@/lib/time";

/**
 * When booking reminders are due (docs/notifications-design.md, Scheduler). Pure apart from `reminderSendCheck`,
 * which the processor runs just before a reminder goes out.
 */

export const REMINDER_EVENT = "booking.reminder";

/** A booking in these states gets no reminder; one queued earlier is dropped at send. */
export const NO_REMINDER_STATUSES = ["cancelled", "no-show", "completed", "pending_payment", "expired"];

export interface ReminderTiming {
  date: Date;
  estimatedAt?: Date | null;
  sessionDate?: Date | null;
  tokenSession?: { startMin: number } | null;
}

/** Start of the token session the booking belongs to, or null for a timed booking. */
export function sessionStartOf(a: ReminderTiming, timeZone: string): Date | null {
  if (!a.tokenSession || !a.sessionDate) return null;
  return zonedToUtc(a.sessionDate.toISOString().slice(0, 10), a.tokenSession.startMin, safeTimeZone(timeZone));
}

/**
 * What the reminder counts back from, and the part of the key that changes when the booking moves.
 * Timed booking: its start. Token booking: the session start, or the estimated turn if that is later; the key
 * uses the session start only, because the estimate drifts as the queue moves and must not re-send.
 */
export function reminderAnchor(a: ReminderTiming, timeZone: string): { at: Date; version: number } {
  const session = sessionStartOf(a, timeZone);
  if (!session) return { at: a.date, version: a.date.getTime() };
  const estimate = a.estimatedAt ?? a.date;
  return { at: estimate > session ? estimate : session, version: session.getTime() };
}

/**
 * Leads (minutes) whose reminder is due now: the due time has come, the booking has not started, and the booking
 * already existed at the due time (one made later has just had its confirmation, so that reminder is skipped).
 */
export function dueLeads(anchor: Date, createdAt: Date, leads: number[], now: Date): number[] {
  if (now >= anchor) return [];
  return leads.filter((lead) => {
    const due = anchor.getTime() - lead * 60_000;
    return now.getTime() >= due && createdAt.getTime() <= due;
  });
}

/** Stored in the reminder's payload so the send-time check can tell whether it still applies. */
export interface ReminderMark { version: number; lead: number }

/**
 * Run at send: a reminder whose booking was cancelled, moved or deleted, or whose lead the business has since
 * removed, is skipped with the reason. Null means send it.
 */
export async function reminderSendCheck(row: Pick<NotificationOutbox, "appointmentId" | "payload">): Promise<string | null> {
  const mark = (row.payload as { reminder?: ReminderMark } | null)?.reminder;
  if (!row.appointmentId || !mark) return "not a booking reminder";
  const a = await prisma.appointment.findUnique({
    where: { id: row.appointmentId },
    select: {
      status: true, date: true, estimatedAt: true, sessionDate: true,
      tokenSession: { select: { startMin: true } },
      business: { select: { timezone: true, notificationPrefs: true } },
    },
  });
  if (!a) return "booking deleted";
  if (NO_REMINDER_STATUSES.includes(a.status)) return `booking ${a.status}`;
  if (reminderAnchor(a, a.business.timezone).version !== mark.version) return "booking moved";
  if (!resolvePrefs(a.business.notificationPrefs).reminderLeadMinutes.includes(mark.lead)) return "turned off by the business";
  return null;
}
