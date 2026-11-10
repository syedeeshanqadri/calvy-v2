import { can, type Permission } from "@/lib/permissions";

/**
 * Who gets which phone alert (pure, unit-tested). The owner gets every kind; a team member gets only what their permissions
 * allow, and with "own appointments only" only the bookings of their linked staff record. Each person can also switch a kind
 * off for themselves (PushPreference); the two checks are separate: permission is what you MAY get, preference is what you WANT.
 */
export const PUSH_KINDS = ["booking_new", "booking_cancelled", "booking_rescheduled", "queue", "payment", "summary", "announcement"] as const;
export type PushKind = (typeof PUSH_KINDS)[number];

export const PREF_FIELDS = ["newBooking", "cancellation", "reschedule", "queue", "payment", "summary"] as const;
export type PrefField = (typeof PREF_FIELDS)[number];
export type PushPrefs = Record<PrefField, boolean>;
export const DEFAULT_PREFS: PushPrefs = { newBooking: true, cancellation: true, reschedule: true, queue: true, payment: true, summary: true };

export const KIND_PREF: Record<PushKind, PrefField | null> = {
  booking_new: "newBooking", booking_cancelled: "cancellation", booking_rescheduled: "reschedule",
  queue: "queue", payment: "payment", summary: "summary", announcement: null,
};

export const PREF_LABELS: Record<PrefField, string> = {
  newBooking: "New booking", cancellation: "Cancellation", reschedule: "Reschedule", queue: "Token queue events", payment: "Payment received", summary: "Daily summary",
};

export interface PushRecipient { isOwner: boolean; permissions: readonly Permission[]; staffId: string | null }

/** May this person receive this kind at all (permissions only)? `bookingStaffId` is whose appointment it is, when it is one. */
export function mayReceive(kind: PushKind, r: PushRecipient, bookingStaffId?: string | null): boolean {
  if (r.isOwner) return true;
  switch (kind) {
    case "booking_new": case "booking_cancelled": case "booking_rescheduled":
      if (can(r.permissions, "appointments.view_all")) return true;
      return can(r.permissions, "appointments.view_own") && !!r.staffId && r.staffId === (bookingStaffId ?? null);
    case "queue": return can(r.permissions, "queue.control");
    case "payment": case "summary": return can(r.permissions, "reports.view");
    case "announcement": return false; // Calvy announcements go to owners only
  }
}

export function wants(kind: PushKind, prefs: Partial<PushPrefs> | null | undefined): boolean {
  const f = KIND_PREF[kind];
  if (!f) return true;
  return (prefs ?? {})[f] ?? DEFAULT_PREFS[f];
}

/** A phone alert never carries a full phone number or email: scrub them from any text, whatever put them there. */
export function scrubContact(text: string): string {
  return text
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "•••")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "•••");
}

/** "Riya Kapoor" -> "Riya K." : first name and an initial is enough to recognise someone on a lock screen. */
export function shortName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "A customer";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}
