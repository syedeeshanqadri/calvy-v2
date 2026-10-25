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
