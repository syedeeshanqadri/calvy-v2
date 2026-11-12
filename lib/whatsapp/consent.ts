import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getBusinessFeatures } from "@/lib/getFeatures";
import { normalizePhone } from "@/lib/phone";

/** DESK: staff recorded that the customer agreed verbally (walk-in form), with the staff user id. */
export const CONSENT_SOURCES = ["booking_form", "chat_widget", "DESK"] as const;
export type ConsentSource = (typeof CONSENT_SOURCES)[number];

/**
 * Store "Get updates on WhatsApp" for a booker. Consent is attached to the client's phone only when the number the
 * booker typed IS the number saved on that client: a booking that could not claim the number (it belongs to someone
 * else) records nothing, so nobody can opt another person in. Never clears consent (only STOP or the email link does).
 */
export async function recordWhatsAppConsent(
  db: Pick<Prisma.TransactionClient, "client">,
  client: { id: string; phone: string | null },
  typedPhone: string | null | undefined,
  tz: string | null | undefined,
  source: ConsentSource,
  now: Date = new Date(),
  by?: string,
): Promise<boolean> {
  const typed = normalizePhone(typedPhone, tz);
  if (!typed || !client.phone || client.phone !== typed) return false;
  await db.client.update({ where: { id: client.id }, data: { whatsappConsent: true, whatsappConsentAt: now, whatsappConsentSource: source, whatsappConsentBy: source === "DESK" ? by ?? null : null } });
  return true;
}

/** Show the checkbox only when WhatsApp is CONNECTED for the business and its plan includes it. */
export async function whatsappOffered(businessId: string): Promise<boolean> {
  const cfg = await prisma.whatsAppConfig.findUnique({ where: { businessId }, select: { status: true } });
  if (cfg?.status !== "CONNECTED") return false;
  return (await getBusinessFeatures(businessId)).whatsappReminders;
}
