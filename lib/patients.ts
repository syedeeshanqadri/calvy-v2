// Who a booking is for, and what contact details a booking needs (pure).
// A person can book for others: the booker's email/phone receive everything, the patient name
// identifies who the appointment is for.
import { countryFromCurrency } from "@/lib/fees";

/** Contact details required to book, by the business's country. India needs both; elsewhere email only. */
export function contactRequirements(currency: string | null | undefined): { email: true; phone: boolean } {
  return { email: true, phone: countryFromCurrency(currency) === "IN" };
}

/** The error to show when required contact details are missing, or null. */
export function missingContact(currency: string | null | undefined, c: { email?: string | null; phone?: string | null }): string | null {
  const need = contactRequirements(currency);
  if (!c.email?.trim()) return "An email address is required.";
  if (need.phone && !c.phone?.trim()) return "A phone number is required.";
  return null;
}

/** Name for comparison: case, accents, punctuation and extra spaces do not matter. */
export function normalizeName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The person an appointment is for: its patient name, else the booking contact's name (older bookings). */
export function patientNameOf(a: { patientName?: string | null; client?: { name: string } | null }): string {
  return a.patientName?.trim() || a.client?.name || "";
}

/** Statuses that count as "already has an appointment". */
export const BLOCKING_STATUSES = ["confirmed", "pending", "pending_payment"] as const;

export interface ExistingBooking {
  patientName?: string | null;
  clientName: string;
  status: string;
  /** Pending payments only block while their hold is live. */
  holdExpiresAt?: Date | null;
}

/**
 * The existing booking that makes `candidateName` a duplicate, if any: same patient name (compared
 * loosely) among a contact's active bookings on that day. Cancelled, missed, expired and finished
 * bookings do not block. Pass only bookings of the same business, contact and day.
 */
export function findDuplicatePatient<T extends ExistingBooking>(candidateName: string, existing: T[], now: Date = new Date()): T | null {
  const want = normalizeName(candidateName);
  if (!want) return null;
  return (
    existing.find((e) => {
      if (!(BLOCKING_STATUSES as readonly string[]).includes(e.status)) return false;
      if (e.status === "pending_payment" && !(e.holdExpiresAt && e.holdExpiresAt.getTime() > now.getTime())) return false;
      return normalizeName(e.patientName?.trim() || e.clientName) === want;
    }) ?? null
  );
}

export function duplicatePatientMessage(name: string, dateLabel: string): string {
  return `${name.trim()} already has an appointment on ${dateLabel}. To book for someone else, enter their name.`;
}

export const PATIENT_RELATIONS = ["child", "parent", "spouse", "other"] as const;
export type PatientRelation = (typeof PATIENT_RELATIONS)[number];
export const PATIENT_RELATION_LABELS: Record<PatientRelation, string> = { child: "Child", parent: "Parent", spouse: "Spouse", other: "Other" };
export const PATIENT_GENDERS = ["female", "male", "other"] as const;

/** Default and bounds of the fair-use cap on different people per booker contact per day. */
export const DEFAULT_MAX_PEOPLE_PER_BOOKER = 4;
export const MAX_PEOPLE_PER_BOOKER_LIMIT = 20;

/**
 * How a booking reads to staff: the patient's name, plus who booked it when that is someone else.
 * "Meena Kapoor (booked by Riya Kapoor)"; just the name when the booker is the patient.
 */
export function bookingForLabel(a: { patientName?: string | null; client?: { name: string } | null }): string {
  const patient = patientNameOf(a);
  const booker = a.client?.name?.trim() ?? "";
  if (!booker || !patient || normalizeName(patient) === normalizeName(booker)) return patient || booker;
  return `${patient} (booked by ${booker})`;
}

/** Is a booking active for the duplicate and fair-use rules? Lapsed payment holds are not. */
function isActive(e: ExistingBooking, now: Date): boolean {
  if (!(BLOCKING_STATUSES as readonly string[]).includes(e.status)) return false;
  return !(e.status === "pending_payment" && !(e.holdExpiresAt && e.holdExpiresAt.getTime() > now.getTime()));
}

/** How many different people a contact has active bookings for (names compared loosely). */
export function countDistinctPatients(existing: ExistingBooking[], now: Date = new Date()): number {
  const names = new Set<string>();
  for (const e of existing) {
    if (isActive(e, now)) names.add(normalizeName(e.patientName?.trim() || e.clientName));
  }
  names.delete("");
  return names.size;
}

/** Would one more person take the contact over the fair-use cap? A person already counted never does. */
export function exceedsPeopleCap(candidateName: string, existing: ExistingBooking[], max: number, now: Date = new Date()): boolean {
  const want = normalizeName(candidateName);
  const known = existing.some((e) => isActive(e, now) && normalizeName(e.patientName?.trim() || e.clientName) === want);
  return !known && countDistinctPatients(existing, now) >= max;
}

export function peopleCapMessage(max: number): string {
  return `You have already booked for ${max} different people today. To book for more, please contact the business directly.`;
}
