import { prisma } from "@/lib/prisma";
import type { NotificationInput } from "@/lib/notifications/enqueue";
import type { Notice } from "@/lib/notifications/events";
import { ALERT_EVENTS, REVIEW_EVENT, REVIEW_DELAY_DEFAULT_HOURS, resolvePrefs, type AlertKind } from "@/lib/notifications/prefs";
import { recentlyAskedForReview } from "@/lib/notifications/reviewThrottle";
import { safeReviewLink } from "@/lib/brandLinks";

/**
 * Messages to the business (docs/notifications-design.md, chunk 5): booking alerts, welcome and "you are live".
 * Plus the customer's review request, which only exists when the business has a review link.
 */

const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL ?? "https://calvy.io").replace(/\/+$/, "");

/** Where alerts go: the business's contact email, else the owner's login email. Null when neither exists. */
export async function alertRecipient(businessId: string): Promise<string | null> {
  const b = await prisma.business.findUnique({ where: { id: businessId }, select: { email: true, owner: { select: { email: true } } } });
  return b?.email?.trim() || b?.owner?.email || null;
}

export interface AlertDetails {
  /** Separates real repeats, like the customer's key does: the move, the payment, the new status. */
  version?: string | number;
  byCustomer?: boolean;
  /** kind "status": the new status in words ("completed", "missed"). */
  statusLabel?: string;
  oldDate?: string;
  oldTime?: string;
  /** What was paid, when that is not the price (a booking fee). */
  price?: number;
}

/** One alert to the business about a booking. Whether it is sent (the business's switches) is decided in enqueue(). */
export function businessAlert(n: Notice, kind: AlertKind, to: string | null, d: AlertDetails = {}): NotificationInput | null {
  if (!to) return null;
  const p = n.payload;
  return {
    event: ALERT_EVENTS[kind],
    audience: "BUSINESS",
    subjectId: n.appointmentId,
    version: d.version,
    recipient: to,
    template: "business_alert",
    businessId: n.businessId,
    appointmentId: n.appointmentId,
    payload: {
      kind, byCustomer: d.byCustomer, statusLabel: d.statusLabel,
      clientName: p.clientName, patientName: p.patientName, serviceName: p.serviceName, staffName: p.staffName,
      date: p.date, time: p.time, oldDate: d.oldDate, oldTime: d.oldTime,
      token: p.token ? { number: p.token.number, sessionName: p.token.sessionName } : undefined,
      price: d.price ?? p.price, currency: p.currency,
      dashboardUrl: `${appUrl()}/dashboard/appointments`,
    },
  };
}

/** Look up the recipient and build the alert; never throws (an alert must not break the change it reports). */
export async function ownerAlert(n: Notice, kind: AlertKind, d: AlertDetails = {}): Promise<NotificationInput | null> {
  try {
    return businessAlert(n, kind, await alertRecipient(n.businessId), d);
  } catch {
    return null;
  }
}

export const REVIEW_DELAY_MS = REVIEW_DELAY_DEFAULT_HOURS * 3_600_000;

/** booking.review_request: once per booking, `delayHours` after it is completed (default 2), only with a valid review link. */
export function reviewRequest(n: Notice, googleReviewUrl: string | null | undefined, now: Date = new Date(), delayHours: number = REVIEW_DELAY_DEFAULT_HOURS): NotificationInput | null {
  const reviewUrl = safeReviewLink(googleReviewUrl);
  if (!n.to || !reviewUrl) return null;
  return {
    event: REVIEW_EVENT, audience: "CUSTOMER", subjectId: n.appointmentId, recipient: n.to, template: "review_request",
    businessId: n.businessId, appointmentId: n.appointmentId, notBefore: new Date(now.getTime() + delayHours * 3_600_000),
    payload: { clientName: n.payload.clientName, businessName: n.payload.businessName, reviewUrl },
  };
}

/**
 * The review request for a completed booking, or null: no review link, no email address, or the customer was already
 * asked in the last 30 days. The business's own delay (1 to 48 hours) applies; the switch and unsubscribes are checked in enqueue().
 */
export async function reviewRequestFor(
  n: Notice,
  business: { googleReviewUrl: string | null; notificationPrefs: unknown },
  now: Date = new Date(),
): Promise<NotificationInput | null> {
  const delay = resolvePrefs(business.notificationPrefs).customer.reviewDelayHours;
  const input = reviewRequest(n, business.googleReviewUrl, now, delay);
  if (!input) return null;
  if (await recentlyAskedForReview(prisma, { businessId: n.businessId, recipient: n.to as string, appointmentId: n.appointmentId, now })) return null;
  return input;
}

/** account.created + business.live: the owner's first two emails, once per business. */
export function ownerOnboarding(b: { businessId: string; slug: string; businessName: string; ownerName: string; ownerEmail: string }): NotificationInput[] {
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  const websiteUrl = root ? `https://${b.slug}.${root}` : `${appUrl()}/${b.slug}`;
  const common = { audience: "BUSINESS" as const, subjectId: b.businessId, recipient: b.ownerEmail, businessId: b.businessId };
  return [
    { ...common, event: "account.created", template: "welcome", payload: { name: b.ownerName, dashboardUrl: `${appUrl()}/dashboard` } },
    { ...common, event: "business.live", template: "business_live", payload: { name: b.ownerName, businessName: b.businessName, websiteUrl } },
  ];
}
