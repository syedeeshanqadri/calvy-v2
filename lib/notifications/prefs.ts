import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { normalizeRecipient } from "@/lib/notifications/policy";
import { sign, verifySignature } from "@/lib/notifications/secret";

/**
 * Which notifications a business and its customers can switch off (docs/notifications-design.md).
 * Everything not listed here is transactional and always sent: confirmations, changes, cancellations,
 * receipts, queue notices and account emails.
 */

/** Events a customer can unsubscribe from. Reminders and review requests join this list when they move to the outbox. */
export const OPTIONAL_EVENTS: ReadonlySet<string> = new Set(["booking.completed"]);

const prefsSchema = z.object({
  customer: z.object({ completed: z.boolean().optional() }).optional(),
});

export interface NotificationPrefs {
  customer: {
    /** "Thanks for visiting" email when a booking is marked completed. */
    completed: boolean;
  };
}

/** Business.notificationPrefs with every default filled in. Invalid or missing JSON means all defaults. */
export function resolvePrefs(raw: unknown): NotificationPrefs {
  const parsed = prefsSchema.safeParse(raw);
  return { customer: { completed: parsed.success ? parsed.data.customer?.completed ?? true : true } };
}

/** The business's own switch for an event (events with no switch are always on). */
const BUSINESS_SWITCH: Record<string, (p: NotificationPrefs) => boolean> = {
  "booking.completed": (p) => p.customer.completed,
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
