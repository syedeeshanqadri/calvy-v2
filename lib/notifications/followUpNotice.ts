import { prisma } from "@/lib/prisma";
import { followUpOffer } from "@/lib/followUp";
import { formatDateLabel, safeTimeZone, utcToZoned, zonedToUtc } from "@/lib/time";

/**
 * The last day of the free follow-up a just-COMPLETED visit earns, as a date label ("30 Nov"), or undefined when none:
 * follow-ups are off (followUpDays 0), the visit has no doctor, it is itself a follow-up, or one was already booked.
 * Same rules as "My bookings" (lib/followUp.ts); the thank-you message carries it, there is no separate message.
 */
export async function followUpDeadlineLabel(
  a: { id: string; status: string; followUpOfId: string | null; staffId: string | null; serviceId: string; date: Date; patientName: string | null; business: { timezone: string | null; followUpDays: number } },
  now: Date = new Date(),
): Promise<string | undefined> {
  if (a.business.followUpDays <= 0 || !a.staffId) return undefined;
  const tz = safeTimeZone(a.business.timezone);
  const used = await prisma.appointment.findFirst({ where: { followUpOfId: a.id }, select: { id: true } });
  const offer = followUpOffer(
    { status: a.status, followUpOfId: a.followUpOfId, hasFollowUp: !!used, staffId: a.staffId, serviceId: a.serviceId, localDate: utcToZoned(a.date, tz).date, patientName: a.patientName ?? "" },
    a.business.followUpDays, utcToZoned(now, tz).date,
  );
  return offer ? formatDateLabel(zonedToUtc(offer.until, 12 * 60, tz), tz) : undefined;
}
