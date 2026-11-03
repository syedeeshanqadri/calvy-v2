import type { Prisma } from "@prisma/client";
import { normalizeRecipient } from "@/lib/notifications/policy";
import { REVIEW_EVENT } from "@/lib/notifications/prefs";

/** One review request per customer per business in any 30 days (Google's guidance: no repeated nagging). */
export const REVIEW_THROTTLE_DAYS = 30;
const DAY_MS = 24 * 3_600_000;

type Db = Pick<Prisma.TransactionClient, "notificationOutbox">;

export function throttleSince(now: Date): Date {
  return new Date(now.getTime() - REVIEW_THROTTLE_DAYS * DAY_MS);
}

/**
 * Queue time: has this customer already been asked (or is a request for another booking waiting)
 * in the last 30 days? The same booking never counts against itself.
 */
export async function recentlyAskedForReview(db: Db, o: { businessId: string; recipient: string; appointmentId: string; now: Date }): Promise<boolean> {
  const hit = await db.notificationOutbox.findFirst({
    where: {
      businessId: o.businessId, event: REVIEW_EVENT, channel: "EMAIL",
      recipient: normalizeRecipient("EMAIL", o.recipient),
      appointmentId: { not: o.appointmentId },
      status: { in: ["PENDING", "SENDING", "SENT"] },
      createdAt: { gte: throttleSince(o.now) },
    },
    select: { id: true },
  });
  return !!hit;
}

/**
 * Send time, for two requests queued at once for the same customer: the earlier row wins
 * (a sent one always does), the later one is skipped. Returns the skip reason, or null to send.
 */
export async function reviewSendBlocker(
  db: Db,
  row: { id: string; businessId: string | null; recipient: string; createdAt: Date },
  now: Date,
): Promise<string | null> {
  if (!row.businessId) return null;
  const other = await db.notificationOutbox.findFirst({
    where: {
      id: { not: row.id }, businessId: row.businessId, event: REVIEW_EVENT, channel: "EMAIL",
      recipient: normalizeRecipient("EMAIL", row.recipient),
      createdAt: { gte: throttleSince(now) },
      OR: [{ status: "SENT" }, { status: { in: ["PENDING", "SENDING"] }, createdAt: { lt: row.createdAt } }],
    },
    select: { id: true },
  });
  return other ? "customer already asked for a review in the last 30 days" : null;
}
