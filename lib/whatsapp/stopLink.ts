import { prisma } from "@/lib/prisma";
import { unsubscribeLinks } from "@/lib/notifications/prefs";
import { isWhatsAppEvent } from "@/lib/whatsapp/events";

/**
 * The "Stop WhatsApp updates" link for a customer EMAIL, or undefined. Shown only where it means something: the
 * business has WhatsApp set up and this customer ticked the box. Same signed link as "Stop these emails" plus `ch=wa`.
 */
export async function whatsappStopLinkFor(row: { channel: string; audience: string; businessId: string | null; appointmentId: string | null; event: string; recipient: string }): Promise<string | undefined> {
  if (row.channel !== "EMAIL" || row.audience !== "CUSTOMER" || !row.businessId || !row.appointmentId || !isWhatsAppEvent(row.event)) return undefined;
  const cfg = await prisma.whatsAppConfig.findUnique({ where: { businessId: row.businessId }, select: { status: true } });
  if (!cfg) return undefined;
  const a = await prisma.appointment.findUnique({ where: { id: row.appointmentId }, select: { businessId: true, client: { select: { whatsappConsent: true } } } });
  if (!a || a.businessId !== row.businessId || !a.client.whatsappConsent) return undefined;
  return `${unsubscribeLinks(row.businessId, row.recipient).page}&ch=wa`;
}
