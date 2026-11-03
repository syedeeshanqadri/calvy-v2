import { createHash } from "crypto";
import { DEFAULT_CURRENCY } from "@/lib/currency";
import type { NotificationInput } from "@/lib/notifications/enqueue";
import type { NotifChannelName } from "@/lib/notifications/policy";
import { REMINDER_EVENT, type ReminderMark } from "@/lib/notifications/reminderRules";
import type { BookingPayload, InvoicePayload } from "@/lib/notifications/templates";
import { meetingUrlFor } from "@/lib/online";
import { t } from "@/lib/terms";
import { formatDateLabel, formatTimeLabel, safeTimeZone } from "@/lib/time";
import { trackingUrl } from "@/lib/tracking";

/**
 * One builder per customer event. A builder only describes the message: who gets it, which template, and the
 * idempotency key (event + subject + version + recipient), so the same event can never queue twice. Whether it
 * is actually sent (business switches, unsubscribes) is decided by enqueue(). Razorpay paths do not use these.
 */

/** Service names of an appointment (multi-service bookings keep extras in notes). */
export function serviceLabel(first: string, notes: string | null): string {
  if (!notes?.startsWith("__services__:")) return first;
  const extra = notes.split("\n")[0].replace("__services__:", "").split("|").filter(Boolean);
  return [first, ...extra].join(" & ");
}

/** What the builders need to know about a booking: the shape Prisma gives back with the usual includes. */
export interface BookingSource {
  id: string;
  businessId: string;
  date: Date;
  duration: number;
  price: number;
  notes: string | null;
  patientName: string | null;
  isOnline: boolean;
  meetingUrl?: string | null;
  tokenNumber?: number | null;
  estimatedAt?: Date | null;
  client: { name: string; email: string | null };
  service: { name: string; meetingUrl?: string | null };
  staff?: { name: string; meetingUrl?: string | null } | null;
  tokenSession?: { name: string } | null;
  business: { name: string; slug: string; timezone: string; currency: string | null; packId: string; termsOverride: unknown };
}

/** A booking, its recipient and the message fields every customer template shares. */
export interface Notice {
  appointmentId: string;
  businessId: string;
  /** The booker's email; with none, no builder returns anything. */
  to: string | null | undefined;
  payload: BookingPayload;
}

export function noticeFrom(a: BookingSource): Notice {
  const tz = safeTimeZone(a.business.timezone);
  const token = a.tokenNumber && a.tokenSession;
  const time = formatTimeLabel(token && a.estimatedAt ? a.estimatedAt : a.date, tz);
  return {
    appointmentId: a.id,
    businessId: a.businessId,
    to: a.client.email,
    payload: {
      clientName: a.client.name,
      patientName: a.patientName ?? undefined,
      businessName: a.business.name,
      serviceName: serviceLabel(a.service.name, a.notes),
      staffName: a.staff?.name ?? `Your ${t(a.business, "staff")}`,
      date: formatDateLabel(a.date, tz),
      time,
      duration: a.duration,
      price: a.price,
      currency: a.business.currency ?? DEFAULT_CURRENCY,
      token: token ? { number: a.tokenNumber as number, estimatedTime: time, sessionName: (a.tokenSession as { name: string }).name } : undefined,
      trackUrl: token ? trackingUrl(a.business.slug, a.id) ?? undefined : undefined,
      online: a.isOnline ? { meetingUrl: meetingUrlFor(a) } : undefined,
    },
  };
}

const base = (n: Notice) => ({
  audience: "CUSTOMER" as const,
  subjectId: n.appointmentId,
  recipient: n.to as string,
  businessId: n.businessId,
  appointmentId: n.appointmentId,
});

/** booking.created: sent once per booking, with the calendar invite. */
export function confirmation(n: Notice, start: Date): NotificationInput | null {
  if (!n.to) return null;
  return {
    ...base(n), event: "booking.created", template: "confirmation",
    payload: { ...n.payload, ics: { appointmentId: n.appointmentId, start: start.toISOString(), durationMinutes: n.payload.duration ?? 30 } },
  };
}

/** booking.rescheduled: once per move. The key is the move itself, so a double click or a retry is one email. */
export function reschedule(n: Notice, move: { from: Date; to: Date; oldDate: string; oldTime: string }): NotificationInput | null {
  if (!n.to) return null;
  return {
    ...base(n), event: "booking.rescheduled", template: "reschedule", version: `${move.from.getTime()}>${move.to.getTime()}`,
    payload: { ...n.payload, oldDate: move.oldDate, oldTime: move.oldTime },
  };
}

/** booking.cancelled: once per booking. */
export function cancellation(n: Notice, rebookUrl?: string): NotificationInput | null {
  if (!n.to) return null;
  return { ...base(n), event: "booking.cancelled", template: "cancellation", payload: { ...n.payload, rebookUrl } };
}

/** booking.meeting_link: once per distinct link, so changing it tells the customer again. */
export function meetingLink(n: Notice, url: string, updated: boolean): NotificationInput | null {
  if (!n.to) return null;
  return {
    ...base(n), event: "booking.meeting_link", template: "meeting_link",
    version: createHash("sha256").update(url).digest("hex").slice(0, 16),
    payload: { ...n.payload, meetingUrl: url, updated },
  };
}

/**
 * booking.paid: the receipt. `price` is what was actually paid (an online booking fee can be less than the
 * service price). `version` separates payments of one booking; manual mark-paid has none, so it is once.
 */
export function receipt(n: Notice, paid: { price?: number; paymentRef?: string; version?: string; serviceName?: string } = {}): NotificationInput | null {
  if (!n.to) return null;
  const payload: InvoicePayload = {
    ...n.payload,
    serviceName: paid.serviceName ?? n.payload.serviceName,
    price: paid.price ?? n.payload.price,
    invoiceNumber: `INV-${n.appointmentId.slice(-8).toUpperCase()}`,
    clientEmail: n.to,
    paymentRef: paid.paymentRef,
  };
  return { ...base(n), event: "booking.paid", template: "invoice", version: paid.version, payload };
}

/** booking.completed (optional mail) or booking.no_show (transactional): once per booking. */
export function statusChange(n: Notice, status: "completed" | "no_show", rebookUrl?: string): NotificationInput | null {
  if (!n.to) return null;
  return { ...base(n), event: `booking.${status}`, template: "status_change", payload: { ...n.payload, status, rebookUrl } };
}

/**
 * booking.reminder: one per lead (24h, 2h...) and booking time, per channel. A move changes `mark.version`, so
 * the new time is reminded again; the old one is skipped at send. Expires when the booking starts.
 * `sessionStart` is the token session's start label ("your session starts at...").
 */
export function reminder(
  n: Notice,
  r: { mark: ReminderMark; startsAt: Date; sessionStart?: string; channel: NotifChannelName; to: string | null | undefined },
): NotificationInput | null {
  if (!r.to) return null;
  const token = n.payload.token && r.sessionStart ? { ...n.payload.token, sessionStart: r.sessionStart } : n.payload.token;
  return {
    ...base(n), event: REMINDER_EVENT, template: "reminder", channel: r.channel, recipient: r.to,
    version: `${r.mark.version}:${r.mark.lead}`, expiresAt: r.startsAt,
    payload: { ...n.payload, token, reminder: r.mark },
  };
}

/** booking.queue_moved_back: once per missed call, so the second and third are told too. */
export function queueMovedBack(n: Notice, place: number, missedCalls: number): NotificationInput | null {
  if (!n.to) return null;
  return { ...base(n), event: "booking.queue_moved_back", template: "queue_moved_back", version: missedCalls, payload: { ...n.payload, place } };
}

/** booking.queue_closed: a token closed at the clinic (missed four calls, or cancelled). Once per booking. */
export function queueClosed(n: Notice, closed: { reason: "missed" | "cancelled"; creditLabel?: string; loginUrl?: string }): NotificationInput | null {
  if (!n.to) return null;
  return { ...base(n), event: "booking.queue_closed", template: "queue_closed", payload: { ...n.payload, ...closed } };
}

/* ── Accounts and the marketing site (no business, no theme) ───────────────── */

type AuthTemplate = "verification" | "password_reset" | "customer_verification" | "customer_password_reset" | "customer_account_setup";

const AUTH_PATH: Record<AuthTemplate, string> = {
  verification: "/verify-email",
  password_reset: "/reset-password",
  customer_verification: "/my/verify-email",
  customer_account_setup: "/my/verify-email?setup=1",
  customer_password_reset: "/my/reset-password",
};

/**
 * Verify or reset email. The link (with its token) travels only in the encrypted `secret`, never in the
 * payload or the key. Each new token is a new email; resending the same token is not.
 */
export function authEmail(i: { template: AuthTemplate; userId: string; to: string; name: string; token: string; baseUrl?: string }): NotificationInput {
  const base = (i.baseUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://calvy.io").replace(/\/+$/, "");
  const customer = i.template.startsWith("customer_");
  return {
    event: i.template.endsWith("verification") || i.template === "customer_account_setup" ? "auth.verify" : "auth.reset",
    audience: customer ? "CUSTOMER" : "BUSINESS",
    subjectId: i.userId,
    version: createHash("sha256").update(i.token).digest("hex").slice(0, 16),
    recipient: i.to,
    template: i.template,
    payload: { name: i.name },
    secret: `${base}${AUTH_PATH[i.template]}${AUTH_PATH[i.template].includes("?") ? "&" : "?"}token=${i.token}`,
  };
}

/** auth.verify-style invite for a team member; the accept link lives only in the encrypted secret. Each new token is a new email. */
export function teamInviteEmail(i: { memberId: string; to: string; name: string; businessName: string; roleName: string; token: string; baseUrl?: string }): NotificationInput {
  const base = (i.baseUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://calvy.io").replace(/\/+$/, "");
  return {
    event: "auth.reset",
    audience: "BUSINESS",
    subjectId: i.memberId,
    version: createHash("sha256").update(i.token).digest("hex").slice(0, 16),
    recipient: i.to,
    template: "team_invite",
    payload: { name: i.name, businessName: i.businessName, roleName: i.roleName },
    secret: `${base}/accept-invite?token=${i.token}`,
  };
}

/** platform.lead: the instant acknowledgment to someone who left their details on the marketing site. */
export function leadAcknowledgment(i: { leadId: string; to: string; name: string; demoRequested: boolean }): NotificationInput {
  return {
    event: "platform.lead", audience: "PLATFORM", subjectId: i.leadId, recipient: i.to, template: "lead",
    payload: { name: i.name, demoRequested: i.demoRequested },
  };
}
