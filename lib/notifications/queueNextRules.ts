import type { NotificationOutbox } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** Run at send: a "turn coming up" message whose token has since been served, closed, cancelled or deleted is skipped. */
export async function queueNextSendCheck(row: Pick<NotificationOutbox, "appointmentId">): Promise<string | null> {
  if (!row.appointmentId) return "not a booking";
  const a = await prisma.appointment.findUnique({ where: { id: row.appointmentId }, select: { status: true, queueState: true, tokenNumber: true } });
  if (!a) return "booking deleted";
  if (a.tokenNumber === null) return "not a token booking";
  if (a.status !== "confirmed") return `booking ${a.status}`;
  if (a.queueState && a.queueState !== "WAITING") return "token is no longer waiting";
  return null;
}
