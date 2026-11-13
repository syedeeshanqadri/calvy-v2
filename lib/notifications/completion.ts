import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { notify, type NotificationInput } from "@/lib/notifications/enqueue";
import { ownerAlert, reviewRequestFor } from "@/lib/notifications/business";
import { noticeFrom, statusChange, type BookingSource, type Notice } from "@/lib/notifications/events";
import { followUpDeadlineLabel } from "@/lib/notifications/followUpNotice";

/**
 * "Visit completed": the ONE event behind the thank-you (email + WhatsApp, with the free follow-up deadline when it
 * applies), the optional review request and the owner's status alert. Both ways of completing a visit use it:
 * marking an appointment completed (app/api/appointments/[id]) and serving a token (lib/queueDb.ts). Each item's
 * key is booking-based (no version), so a visit completed in both places is still one message.
 */
export async function visitCompletedItems(
  n: Notice,
  full: BookingSource & { id: string; status: string; followUpOfId: string | null; staffId: string | null; serviceId: string; date: Date; patientName: string | null; business: BookingSource["business"] & { followUpDays: number; googleReviewUrl: string | null; notificationPrefs: unknown } },
  rebookUrl: string,
): Promise<{ owner: NotificationInput | null; review: NotificationInput | null; customer: NotificationInput | null }> {
  return {
    owner: await ownerAlert(n, "status", { version: "completed", statusLabel: "completed" }),
    review: await reviewRequestFor(n, full.business),
    customer: statusChange(n, "completed", rebookUrl, await followUpDeadlineLabel(full)),
  };
}

/** For a token served at reception: load the (now completed) booking and queue the same notices. Never throws. */
export async function notifyTokenVisitCompleted(appointmentId: string, businessId: string): Promise<void> {
  try {
    const full = await prisma.appointment.findFirst({
      where: { id: appointmentId, businessId },
      include: { client: true, service: true, staff: true, business: true, tokenSession: { select: { name: true, startMin: true } } },
    });
    if (!full || full.status !== "completed") return;
    const n = noticeFrom(full);
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
    const { owner, review, customer } = await visitCompletedItems(n, full, `${appUrl}/${full.business.slug}`);
    await notify(owner, review);
    await notify(customer);
  } catch (err) {
    logger.error("[Queue] visit-completed notification failed:", { err });
  }
}
