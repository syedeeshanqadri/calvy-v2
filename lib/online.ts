import { z } from "zod";

/** Online consultations: how a service is offered, which meeting link applies, and who may see it. */

export const SERVICE_MODES = ["IN_PERSON", "ONLINE", "BOTH"] as const;
export type ServiceModeValue = (typeof SERVICE_MODES)[number];

/** What the customer picks when booking a service that is offered both ways. */
export type BookingMode = "in_person" | "online";

/** A meeting link: any provider (Meet, Zoom, Teams...), but https only, so no javascript: or plain http. */
export const meetingUrlSchema = z
  .string()
  .trim()
  .max(500)
  .refine((v) => {
    try {
      const u = new URL(v);
      return u.protocol === "https:" && !!u.hostname.includes(".") && !u.username && !u.password;
    } catch {
      return false;
    }
  }, "Enter a full https:// meeting link, for example https://meet.google.com/abc-defg-hij");

/** Empty clears the link; otherwise it must be a valid https link. For optional form fields. */
export const meetingUrlOrEmpty = z.union([z.literal(""), meetingUrlSchema]);

/** Is the badge / mode picker relevant for this service? */
export function offersOnline(svc: { mode?: ServiceModeValue | null }): boolean {
  return svc.mode === "ONLINE" || svc.mode === "BOTH";
}

/**
 * Whether a booking is online. ONLINE services always are, IN_PERSON never; a BOTH service needs the
 * customer's choice. Several services: the first one decides (it is the one stored on the appointment).
 */
export function resolveBookingMode(
  svc: { mode?: ServiceModeValue | null },
  requested: BookingMode | undefined,
): { ok: true; isOnline: boolean } | { ok: false; error: string } {
  const mode = svc.mode ?? "IN_PERSON";
  if (mode === "ONLINE") {
    if (requested === "in_person") return { ok: false, error: "This service is only available online." };
    return { ok: true, isOnline: true };
  }
  if (mode === "IN_PERSON") {
    if (requested === "online") return { ok: false, error: "This service is only available in person." };
    return { ok: true, isOnline: false };
  }
  if (!requested) return { ok: false, error: "Please choose in person or online." };
  return { ok: true, isOnline: requested === "online" };
}

/** The link for an online booking: the service's own override, else the staff member's default. */
export function resolveMeetingUrl(
  svc: { meetingUrl?: string | null } | null | undefined,
  staff: { meetingUrl?: string | null } | null | undefined,
): string | null {
  return svc?.meetingUrl?.trim() || staff?.meetingUrl?.trim() || null;
}

/** Link to show for an appointment: only online ones have one. Callers must already have authorised the viewer. */
export function meetingUrlFor(
  appt: { isOnline: boolean; service?: { meetingUrl?: string | null } | null; staff?: { meetingUrl?: string | null } | null },
): string | null {
  return appt.isOnline ? resolveMeetingUrl(appt.service, appt.staff) : null;
}

/** Public badge text for a service ("" for in-person only). Says nothing about any link. */
export function onlineBadge(svc: { mode?: ServiceModeValue | null }): string {
  return svc.mode === "ONLINE" ? "Online" : svc.mode === "BOTH" ? "Online or in person" : "";
}

/** Clinic pack: shown with the booking terms for an online consultation. The doctor, not Calvy, is responsible. */
export function telemedicineNote(packId: string | null | undefined): string | null {
  return packId === "CLINIC"
    ? "Online consultations are provided by the doctor, who is responsible for the advice given. They are not suitable for emergencies: if you need urgent care, visit a hospital or call your local emergency number."
    : null;
}
