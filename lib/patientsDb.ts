import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { BLOCKING_STATUSES, duplicatePatientMessage, findDuplicatePatient } from "@/lib/patients";
import { formatDateLabel, zonedDayRange, zonedToUtc } from "@/lib/time";

type Db = Prisma.TransactionClient | typeof prisma;

/** Thrown when the same patient already has an active appointment that day. */
export class DuplicatePatientError extends Error {
  readonly code = "DUPLICATE_PATIENT";
}

/**
 * One person cannot hold two active appointments with a business on the same day, but one contact
 * (email/phone) may book for several different people. Compares the patient name against the
 * contact's other active bookings that day.
 */
export async function assertNoDuplicatePatient(
  db: Db,
  p: { businessId: string; clientId: string; patientName: string; date: string; tz: string },
): Promise<void> {
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
