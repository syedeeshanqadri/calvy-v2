import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { normalizeRecipient } from "@/lib/notifications/policy";
import { sign, verifySignature } from "@/lib/notifications/secret";

/**
 * Which notifications a business and its customers can switch off (docs/notifications-design.md).
 * Everything not listed here is transactional and always sent: confirmations, changes, cancellations,
 * receipts, queue notices and account emails.
 */

/** Events a customer can unsubscribe from (optional mail: a footer link and List-Unsubscribe headers). */
export const OPTIONAL_EVENTS: ReadonlySet<string> = new Set(["booking.completed", "booking.reminder", "booking.review_request"]);

/** Owner alerts: one event per kind, separate from the customer's email for the same change. */
export const ALERT_EVENTS = {
  created: "alert.booking.created",
  rescheduled: "alert.booking.rescheduled",
  cancelled: "alert.booking.cancelled",
  paid: "alert.booking.paid",
  status: "alert.booking.status",
} as const;
export type AlertKind = keyof typeof ALERT_EVENTS;
export const SUMMARY_EVENT = "summary.daily";
export const REVIEW_EVENT = "booking.review_request";

/** How long before a booking a reminder may go: 1h, 2h, 3h, 24h, 48h. */
export const REMINDER_LEADS = [60, 120, 180, 1440, 2880] as const;
export const MAX_REMINDERS = 2;
const DEFAULT_REMINDER_LEADS = [1440];

const prefsSchema = z.object({
  customer: z.object({ completed: z.boolean().optional(), reviewRequest: z.boolean().optional() }).optional(),
  business: z.object({
    created: z.boolean().optional(), rescheduled: z.boolean().optional(), cancelled: z.boolean().optional(),
    paid: z.boolean().optional(), status: z.boolean().optional(),
  }).optional(),
  dailySummary: z.boolean().optional(),
  reminderLeadMinutes: z.array(z.number()).optional(),
});

export interface NotificationPrefs {
  customer: {
    /** "Thanks for visiting" email when a booking is marked completed. */
    completed: boolean;
    /** Google review request 2h after a booking is completed (needs the business's review link). */
    reviewRequest: boolean;
  };
  /** Alerts to the business: new booking, rescheduled, cancelled and paid are on; other status changes are off. */
  business: Record<AlertKind, boolean>;
  /** Morning email at 08:00 business time (opt-in). */
  dailySummary: boolean;
  /** Up to two reminders, longest lead first (24h + 2h, say). Empty means the business sends no reminders. */
  reminderLeadMinutes: number[];
}

/** Allowed leads only, no repeats, at most two. Not set means the default (one, 24h before). */
export function resolveReminderLeads(raw: number[] | undefined): number[] {
  if (raw === undefined) return [...DEFAULT_REMINDER_LEADS];
  const allowed = new Set<number>(REMINDER_LEADS);
  return [...new Set(raw.filter((m) => allowed.has(m)))].sort((a, b) => b - a).slice(0, MAX_REMINDERS);
}

/** Business.notificationPrefs with every default filled in. Invalid or missing JSON means all defaults. */
export function resolvePrefs(raw: unknown): NotificationPrefs {
  const parsed = prefsSchema.safeParse(raw);
  const data = parsed.success ? parsed.data : {};
  const b = data.business ?? {};
  return {
    customer: { completed: data.customer?.completed ?? true, reviewRequest: data.customer?.reviewRequest ?? true },
    business: { created: b.created ?? true, rescheduled: b.rescheduled ?? true, cancelled: b.cancelled ?? true, paid: b.paid ?? true, status: b.status ?? false },
    dailySummary: data.dailySummary ?? false,
    reminderLeadMinutes: resolveReminderLeads(data.reminderLeadMinutes),
  };
}

/** What the settings page saves: every field, strictly typed. Reminder leads must be allowed values, distinct. */
export const prefsInputSchema = z.object({
  customer: z.object({ completed: z.boolean(), reviewRequest: z.boolean() }).strict(),
  business: z.object({ created: z.boolean(), rescheduled: z.boolean(), cancelled: z.boolean(), paid: z.boolean(), status: z.boolean() }).strict(),
  dailySummary: z.boolean(),
  reminderLeadMinutes: z.array(z.number().refine((m) => (REMINDER_LEADS as readonly number[]).includes(m), "Not an allowed reminder time"))
    .max(MAX_REMINDERS)
    .refine((l) => new Set(l).size === l.length, "The two reminders must be at different times"),
}).strict();

/** The business's own switch for an event (events with no switch are always on). */
const BUSINESS_SWITCH: Record<string, (p: NotificationPrefs) => boolean> = {
  "booking.completed": (p) => p.customer.completed,
  [REVIEW_EVENT]: (p) => p.customer.reviewRequest,
  [SUMMARY_EVENT]: (p) => p.dailySummary,
  ...Object.fromEntries((Object.keys(ALERT_EVENTS) as AlertKind[]).map((k) => [ALERT_EVENTS[k], (p: NotificationPrefs) => p.business[k]])),
};

export interface SkipCandidate { businessId: string | null; event: string; recipient: string }

type Db = Pick<Prisma.TransactionClient, "business" | "notificationOptOut">;

/**
 * Why each candidate must not be sent, by index: the business turned it off, or the recipient
 * unsubscribed from the business's optional mail. Candidates with no reason are absent. Queries only run
 * for events that can be switched off, so most messages cost nothing here.
 */
export async function skipReasons(db: Db, candidates: SkipCandidate[]): Promise<Map<number, string>> {
  const reasons = new Map<number, string>();
  const switched = candidates.map((c, i) => ({ c, i })).filter(({ c }) => c.businessId && BUSINESS_SWITCH[c.event]);
  const optional = candidates.map((c, i) => ({ c, i })).filter(({ c }) => c.businessId && OPTIONAL_EVENTS.has(c.event));

  if (switched.length) {
    const ids = [...new Set(switched.map(({ c }) => c.businessId as string))];
    const rows = await db.business.findMany({ where: { id: { in: ids } }, select: { id: true, notificationPrefs: true } });
    const prefs = new Map(rows.map((r) => [r.id, resolvePrefs(r.notificationPrefs)]));
    for (const { c, i } of switched) {
      if (!BUSINESS_SWITCH[c.event](prefs.get(c.businessId as string) ?? resolvePrefs(null))) reasons.set(i, "turned off by the business");
    }
  }

  if (optional.length) {
    const found = await db.notificationOptOut.findMany({
      where: {
        businessId: { in: [...new Set(optional.map(({ c }) => c.businessId as string))] },
        recipient: { in: [...new Set(optional.map(({ c }) => normalizeRecipient("EMAIL", c.recipient)))] },
      },
      select: { businessId: true, recipient: true },
    });
    const out = new Set(found.map((f) => `${f.businessId}|${f.recipient}`));
    for (const { c, i } of optional) {
      if (out.has(`${c.businessId}|${normalizeRecipient("EMAIL", c.recipient)}`)) reasons.set(i, "unsubscribed");
    }
  }
  return reasons;
}

/* ── Unsubscribe links ────────────────────────────────────────────────────── */

const PURPOSE = "unsubscribe";
const value = (businessId: string, recipient: string) => `${businessId}|${normalizeRecipient("EMAIL", recipient)}`;
const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL ?? "https://calvy.io").replace(/\/+$/, "");

export function unsubscribeSignature(businessId: string, recipient: string): string {
  return sign(PURPOSE, value(businessId, recipient));
}

export function isValidUnsubscribe(businessId: string, recipient: string, signature: string): boolean {
  return verifySignature(PURPOSE, value(businessId, recipient), signature);
}

/** `page` is the link in the email footer; `oneClick` is the List-Unsubscribe URL that mail apps POST to. */
export function unsubscribeLinks(businessId: string, recipient: string): { page: string; oneClick: string } {
  const query = new URLSearchParams({
    b: businessId,
    e: Buffer.from(normalizeRecipient("EMAIL", recipient)).toString("base64url"),
    s: unsubscribeSignature(businessId, recipient),
  }).toString();
  return { page: `${appUrl()}/unsubscribe?${query}`, oneClick: `${appUrl()}/api/unsubscribe?${query}` };
}
