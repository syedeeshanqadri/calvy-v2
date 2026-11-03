import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { signTicket, verifyTicket } from "@/lib/signedTicket";
import { tryNormalizeEmail } from "@/lib/email-normalize";
import { patientNameOf } from "@/lib/patients";
import { formatDateLabel, safeTimeZone, utcToZoned, zonedToUtc } from "@/lib/time";
import { evaluateFollowUp, followUpOffer, FOLLOW_UP_TICKET_PURPOSE, FOLLOW_UP_TICKET_TTL_MS, type FollowUpOffer, type FollowUpResult } from "@/lib/followUp";

type Db = PrismaClient | Prisma.TransactionClient;

/** A signed, one-hour ticket from "My bookings": it names the verified customer and the appointment (the booking page lives on another host, so the session cookie is not there). */
export function signFollowUpTicket(customerId: string, appointmentId: string): string {
  return signTicket(FOLLOW_UP_TICKET_PURPOSE, `${customerId}:${appointmentId}`, process.env.NEXTAUTH_SECRET ?? "", FOLLOW_UP_TICKET_TTL_MS);
}

export function readFollowUpTicket(ticket: string | null | undefined): { customerId: string; appointmentId: string } | null {
  const v = verifyTicket(FOLLOW_UP_TICKET_PURPOSE, ticket, process.env.NEXTAUTH_SECRET ?? "");
  const [customerId, appointmentId, extra] = (v ?? "").split(":");
  return customerId && appointmentId && extra === undefined ? { customerId, appointmentId } : null;
}

export class FollowUpTicketError extends Error {
  constructor() { super("Your follow-up link has expired. Open it again from My bookings."); }
}

/**
 * The first appointment behind a ticket, but only while the ticket's customer is verified, the appointment belongs
 * to that customer's verified email, and it is a completed, not-yet-followed-up appointment of this business.
 */
export async function loadFollowUpFirst(db: Db, ticket: string, business: { id: string; timezone: string | null; followUpDays: number }) {
  const t = readFollowUpTicket(ticket);
  if (!t) throw new FollowUpTicketError();
  const customer = await db.customer.findUnique({ where: { id: t.customerId }, select: { email: true, emailVerified: true } });
  if (!customer?.emailVerified) throw new FollowUpTicketError();
  const a = await db.appointment.findFirst({
    where: { id: t.appointmentId, businessId: business.id },
    select: {
      status: true, staffId: true, serviceId: true, date: true, patientName: true, followUpOfId: true,
      client: { select: { name: true, email: true } }, followUp: { select: { id: true } },
    },
  });
  if (!a || tryNormalizeEmail(a.client.email) !== tryNormalizeEmail(customer.email)) throw new FollowUpTicketError();
  const tz = safeTimeZone(business.timezone);
  return {
    first: {
      status: a.status, followUpOfId: a.followUpOfId, hasFollowUp: !!a.followUp, staffId: a.staffId, serviceId: a.serviceId,
      localDate: utcToZoned(a.date, tz).date, patientName: patientNameOf(a),
    },
    firstId: t.appointmentId,
    clientEmail: a.client.email,
  };
}

/**
 * Is this booking the free follow-up of the ticket's appointment? `followUpOfId` is set only when every rule holds;
 * otherwise the booking goes through as an ordinary paid one. A bad or expired ticket throws FollowUpTicketError.
 */
export async function resolveFollowUp(
  db: Db,
  input: { ticket: string; business: { id: string; timezone: string | null; followUpDays: number }; staffId: string | null; serviceIds: string[]; date: string; patientName: string; bookerEmail: string },
): Promise<{ followUpOfId: string | null; result: FollowUpResult }> {
  const { first, firstId, clientEmail } = await loadFollowUpFirst(db, input.ticket, input.business);
  // The booking's contact must be the same person's email: a ticket cannot be spent on a booking made for another contact.
  if (tryNormalizeEmail(input.bookerEmail) !== tryNormalizeEmail(clientEmail)) return { followUpOfId: null, result: { free: false, reason: "other-person" } };
  const result = evaluateFollowUp({
    days: input.business.followUpDays, first,
    booking: { staffId: input.staffId, serviceIds: input.serviceIds, localDate: input.date, patientName: input.patientName },
  });
  return { followUpOfId: result.free ? firstId : null, result };
}

/** The offer shown on the booking page for a ticket. Null when nothing is on offer (off, used, expired, wrong business). */
export async function followUpOfferForTicket(
  ticket: string,
  business: { id: string; timezone: string | null; followUpDays: number },
  todayLocal: string,
): Promise<FollowUpOffer | null> {
  try {
    const { first, clientEmail } = await loadFollowUpFirst(prisma, ticket, business);
    const offer = followUpOffer(first, business.followUpDays, todayLocal);
    if (!offer) return null;
    const tz = safeTimeZone(business.timezone);
    const doctor = first.staffId ? await prisma.staff.findFirst({ where: { id: first.staffId, businessId: business.id }, select: { name: true } }) : null;
    return {
      ticket, staffId: first.staffId, serviceId: first.serviceId, doctorName: doctor?.name ?? null,
      until: offer.until, untilLabel: formatDateLabel(zonedToUtc(offer.until, 12 * 60, tz), tz),
      patientName: first.patientName, email: clientEmail ?? "",
    };
  } catch {
    return null;
  }
}

/** For the booking pages: the follow-up offer behind `?followUp=<ticket>`, if the link is still good. */
export async function followUpFromQuery(
  value: string | string[] | undefined,
  business: { id: string; timezone: string | null; followUpDays: number },
): Promise<FollowUpOffer | null> {
  const ticket = Array.isArray(value) ? value[0] : value;
  if (!ticket || business.followUpDays <= 0) return null;
  const today = utcToZoned(new Date(), safeTimeZone(business.timezone)).date;
  return followUpOfferForTicket(ticket, business, today);
}
