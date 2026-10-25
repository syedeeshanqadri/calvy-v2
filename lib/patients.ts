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
