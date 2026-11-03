import { addDays } from "@/lib/time";
import { normalizeName } from "@/lib/patients";

/**
 * Free follow-up rules (pure, unit-tested). After a COMPLETED appointment (completed means it was done and paid) the
 * same person may book ONE free follow-up with the same doctor, for the same service, within `days` days of that
 * appointment's date. Anything else (another doctor, a later date, another person) is an ordinary paid booking.
 */
export const FOLLOW_UP_TICKET_PURPOSE = "follow-up";
export const FOLLOW_UP_TICKET_TTL_MS = 60 * 60_000;
export const MAX_FOLLOW_UP_DAYS = 365;

export interface FollowUpFirst {
  status: string;
  /** The first appointment is itself a follow-up: a follow-up never earns another one. */
  followUpOfId: string | null;
  /** A follow-up already exists for it: only one is allowed. */
  hasFollowUp: boolean;
  staffId: string | null;
  serviceId: string;
  /** YYYY-MM-DD in the business timezone. */
  localDate: string;
  patientName: string;
}

export interface FollowUpBooking {
  staffId: string | null;
  serviceIds: string[];
  /** YYYY-MM-DD in the business timezone. */
  localDate: string;
  patientName: string;
}

export type FollowUpReason = "off" | "not-completed" | "is-follow-up" | "already-used" | "other-doctor" | "other-service" | "outside-window" | "other-person";
export type FollowUpResult = { free: true; until: string } | { free: false; reason: FollowUpReason };

/** Last day (inclusive) a follow-up may be booked for, in the business timezone. */
export function followUpUntil(firstLocalDate: string, days: number): string {
  return addDays(firstLocalDate, days);
}

/** Can this completed appointment still earn a follow-up today? (what "My bookings" offers.) */
export function followUpOffer(first: FollowUpFirst, days: number, todayLocal: string): { until: string } | null {
  if (days <= 0) return null;
  if (first.status !== "completed" || first.followUpOfId || first.hasFollowUp) return null;
  const until = followUpUntil(first.localDate, days);
  return todayLocal <= until ? { until } : null;
}

/** Is this booking the free follow-up of `first`? The answer for a booking attempt; the server repeats it. */
export function evaluateFollowUp(i: { days: number; first: FollowUpFirst; booking: FollowUpBooking }): FollowUpResult {
  const { days, first, booking } = i;
  if (days <= 0) return { free: false, reason: "off" };
  if (first.status !== "completed") return { free: false, reason: "not-completed" };
  if (first.followUpOfId) return { free: false, reason: "is-follow-up" };
  if (first.hasFollowUp) return { free: false, reason: "already-used" };
  if (!first.staffId || booking.staffId !== first.staffId) return { free: false, reason: "other-doctor" };
  if (booking.serviceIds.length !== 1 || booking.serviceIds[0] !== first.serviceId) return { free: false, reason: "other-service" };
  if (normalizeName(booking.patientName) !== normalizeName(first.patientName)) return { free: false, reason: "other-person" };
  const until = followUpUntil(first.localDate, days);
  if (booking.localDate < first.localDate || booking.localDate > until) return { free: false, reason: "outside-window" };
  return { free: true, until };
}

/** What the booking page shows for a valid follow-up link. Display and pre-selection only: the server decides on the booking itself. */
export interface FollowUpOffer {
  ticket: string;
  staffId: string | null;
  serviceId: string;
  doctorName: string | null;
  /** Last day, YYYY-MM-DD, and the same as a label. */
  until: string;
  untilLabel: string;
  /** The person and booker contact the follow-up is for. */
  patientName: string;
  email: string;
}
