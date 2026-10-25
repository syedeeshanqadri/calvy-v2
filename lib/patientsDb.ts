import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { BLOCKING_STATUSES, duplicatePatientMessage, findDuplicatePatient, normalizeName } from "@/lib/patients";
import { formatDateLabel, zonedDayRange, zonedToUtc } from "@/lib/time";

type Db = Prisma.TransactionClient | typeof prisma;

/** Thrown when the same patient already has an active appointment that day. */
export class DuplicatePatientError extends Error {
  readonly code = "DUPLICATE_PATIENT";
}

/**
 * One person cannot hold two active appointments with a business on the same day, but one contact
 * (email/phone) may book for several different people. Compares the patient name against the
 * contact's other active bookings that day. Call it inside the booking transaction.
 *
 * Known tradeoff (asked for by the owner): the refusal tells the caller that a person with that
 * name and contact already has a booking that day. It is limited per contact in the booking route,
 * and a clinic can cancel an unwanted booking from the dashboard, which lifts the block.
 */
export async function assertNoDuplicatePatient(
  db: Db,
  p: { businessId: string; clientId: string; patientName: string; date: string; tz: string },
): Promise<void> {
  // One lock per patient per business: concurrent bookings for the same person line up here, so the
  // second one sees the first. Held until the surrounding transaction ends.
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`patient:${p.businessId}:${p.clientId}:${normalizeName(p.patientName)}`}, 0))`;
  const day = zonedDayRange(p.date, p.tz);
  const rows = await db.appointment.findMany({
    where: { businessId: p.businessId, clientId: p.clientId, date: { gte: day.start, lt: day.end }, status: { in: [...BLOCKING_STATUSES] } },
    select: { patientName: true, status: true, holdExpiresAt: true, client: { select: { name: true } } },
  });
  const dup = findDuplicatePatient(
    p.patientName,
    rows.map((r) => ({ patientName: r.patientName, clientName: r.client?.name ?? "", status: r.status, holdExpiresAt: r.holdExpiresAt })),
  );
  if (dup) throw new DuplicatePatientError(duplicatePatientMessage(p.patientName, formatDateLabel(zonedToUtc(p.date, 12 * 60, p.tz), p.tz)));
}

/** Generous: a family booking several people never gets near it; a flood in one person's name does. */
export const MAX_BOOKINGS_PER_CONTACT_PER_DAY = 30;

/**
 * Has this contact already had the day's quota of bookings created under it? When yes, the booking
 * still goes through, but no confirmation email or WhatsApp is sent to the contact. That bounds a
 * flood of messages at someone's inbox without ever blocking the person from booking: contact
 * details are not verified, so a limit that blocked them could be used against their owner.
 *
 * Takes a per-contact lock first, so concurrent bookings cannot all slip under the quota. Call it
 * inside the booking transaction, after the resource and patient locks (fixed lock order).
 */
export async function contactAtDailyCap(
  db: Db,
  p: { businessId: string; clientId: string; now?: Date },
): Promise<boolean> {
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`contact:${p.businessId}:${p.clientId}`}, 0))`;
  const since = new Date((p.now ?? new Date()).getTime() - 24 * 3_600_000);
  const created = await db.appointment.count({ where: { businessId: p.businessId, clientId: p.clientId, createdAt: { gte: since } } });
  return created >= MAX_BOOKINGS_PER_CONTACT_PER_DAY;
}
