import { createHash } from "crypto";

export interface IcsDetails {
  /** Makes the UID stable, so a resent invite updates the calendar entry instead of adding a second one. */
  appointmentId?: string;
  serviceName: string;
  businessName: string;
  staffName?: string;
  durationMinutes: number;
  start: Date;
  /** Bumped on every update of the same appointment (calendars ignore an update whose SEQUENCE is not higher). 0 = the first invite. */
  sequence?: number;
  /** A METHOD:CANCEL message: removes the entry from the customer's calendar. */
  cancel?: boolean;
}

/** SEQUENCE for an update sent at `now`: seconds since 1 Jan 2026, so a later change always outranks an earlier one (and the confirmation, 0). */
export const ICS_EPOCH_MS = Date.UTC(2026, 0, 1);
export const icsSequence = (now: Date = new Date()): number => Math.max(1, Math.floor((now.getTime() - ICS_EPOCH_MS) / 1000));

export interface Attachment { filename: string; content: string; contentType: string }

const stamp = (d: Date) => d.toISOString().replace(/[-:.]/g, "").slice(0, 15) + "Z";
const CONTROL = /[\x00-\x1f\x7f]/g;
/** RFC 5545 text: a business-entered name must not break the line or add a field. */
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n").replace(CONTROL, "");
/** A parameter value is not text: it ends at an unquoted `:` or `;`, so it is always quoted, and `"` cannot appear inside. */
const param = (s: string) => `"${s.replace(CONTROL, "").replace(/"/g, "")}"`;

/** Same details = same bytes: a retry must send an identical message, or Resend rejects its idempotency key. */
export function icsAttachment(d: IcsDetails): Attachment {
  const end = new Date(d.start.getTime() + d.durationMinutes * 60_000);
  const id = d.appointmentId ?? createHash("sha256").update(`${d.start.getTime()}|${d.businessName}|${d.serviceName}`).digest("hex").slice(0, 32);
  const fromEmail = (process.env.EMAIL_FROM ?? "").match(/<(.+)>/)?.[1] ?? "noreply@calvy.io";
  const summary = esc(`${d.serviceName} at ${d.businessName}`);
  const description = esc(`Your appointment for ${d.serviceName}${d.staffName ? ` with ${d.staffName}` : ""} at ${d.businessName}.`);
  const method = d.cancel ? "CANCEL" : "REQUEST";
  const seq = Math.max(0, Math.floor(d.sequence ?? 0));
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Calvy//Booking//EN", "CALSCALE:GREGORIAN", `METHOD:${method}`,
    "BEGIN:VEVENT", `UID:${id}@calvy.io`,
    // An update carries its own DTSTAMP (derived from the sequence, so a retry is byte-identical); the first invite has none.
    ...(seq > 0 ? [`DTSTAMP:${stamp(new Date(ICS_EPOCH_MS + seq * 1000))}`] : []),
    `DTSTART:${stamp(d.start)}`, `DTEND:${stamp(end)}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    `ORGANIZER;CN=${param(d.businessName)}:mailto:${fromEmail}`,
    `STATUS:${d.cancel ? "CANCELLED" : "CONFIRMED"}`, `SEQUENCE:${seq}`,
    ...(d.cancel ? [] : ["BEGIN:VALARM", "TRIGGER:-PT60M", "ACTION:DISPLAY", "DESCRIPTION:Reminder: Your appointment is in 1 hour", "END:VALARM"]),
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  return { filename: "appointment.ics", content: Buffer.from(ics, "utf-8").toString("base64"), contentType: `text/calendar; charset=utf-8; method=${method}` };
}
