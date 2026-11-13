import { prisma } from "@/lib/prisma";
import { toE164 } from "@/lib/whatsapp/store";

/**
 * "Stop WhatsApp updates" from the email link: every client of this business with that email loses consent and their
 * number joins the business's opt-out list (the same list STOP replies write to), so nothing more goes to it.
 */
export async function stopWhatsAppFor(businessId: string, email: string): Promise<number> {
  const clients = await prisma.client.findMany({ where: { businessId, email: { equals: email, mode: "insensitive" } }, select: { id: true, phone: true } });
  for (const c of clients) {
    await prisma.client.update({ where: { id: c.id }, data: { whatsappConsent: false } });
    if (c.phone) {
      await prisma.whatsAppOptOut.upsert({ where: { businessId_phone: { businessId, phone: toE164(c.phone) } }, create: { businessId, phone: toE164(c.phone) }, update: {} });
    }
  }
  return clients.length;
}
