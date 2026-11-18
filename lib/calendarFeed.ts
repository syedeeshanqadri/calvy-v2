// Private subscribable calendar feeds (iCalendar, METHOD:PUBLISH): one per business and one per staff member.
// The secret token in the URL is the only credential, like a Google "secret address in iCal format", so it works with
// Google Calendar, Outlook and Apple Calendar without a login. Regenerating the token breaks the old URL.
import { randomBytes } from "node:crypto";

export const FEED_PAST_DAYS = 14;
export const FEED_FUTURE_DAYS = 365;
export const FEED_MAX_EVENTS = 2000;

/** 32 random bytes, hex: unguessable and URL-safe. */
export const newCalendarToken = () => randomBytes(32).toString("hex");

/** The token out of a URL segment: accepts `<64 hex>` and `<64 hex>.ics`; anything else is null. */
export function parseCalendarToken(segment: string): string | null {
  const t = segment.replace(/\.ics$/i, "");
  return /^[a-f0-9]{64}$/.test(t) ? t : null;
}

export interface FeedEvent {
  id: string;
  start: Date;
  durationMinutes: number;
  summary: string;
  description?: string;
  /** Cancelled and no-show bookings are published as STATUS:CANCELLED so a subscribed calendar drops them. */
  cancelled: boolean;
  /** Last change, used as DTSTAMP and LAST-MODIFIED so a calendar notices edits. */
  modified: Date;
}

const stamp = (d: Date) => d.toISOString().replace(/[-:.]/g, "").slice(0, 15) + "Z";
const CONTROL = /[\x00-\x1f\x7f]/g;
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n").replace(CONTROL, "");

/** RFC 5545 line folding: no line longer than 75 octets; continuation lines start with one space. */
export function fold(line: string): string {
  if (Buffer.byteLength(line, "utf8") <= 75) return line;
  const out: string[] = [];
  let cur = "";
  for (const ch of line) {
    const limit = out.length === 0 ? 75 : 74; // continuation lines lose one octet to the leading space
    if (Buffer.byteLength(cur + ch, "utf8") > limit) { out.push(cur); cur = ch; } else cur += ch;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export function buildFeed(calendarName: string, events: FeedEvent[]): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Calvy//Calendar feed//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(calendarName)}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H",
  ];
  for (const e of events) {
    const end = new Date(e.start.getTime() + Math.max(5, e.durationMinutes) * 60_000);
    lines.push(
      "BEGIN:VEVENT", `UID:${e.id}@calvy.io`, `DTSTAMP:${stamp(e.modified)}`, `LAST-MODIFIED:${stamp(e.modified)}`,
      `DTSTART:${stamp(e.start)}`, `DTEND:${stamp(end)}`, `SUMMARY:${esc(e.summary)}`,
      ...(e.description ? [`DESCRIPTION:${esc(e.description)}`] : []),
      `STATUS:${e.cancelled ? "CANCELLED" : "CONFIRMED"}`, "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** The window of bookings a feed carries. */
export function feedWindow(now: Date = new Date()): { from: Date; to: Date } {
  return { from: new Date(now.getTime() - FEED_PAST_DAYS * 86_400_000), to: new Date(now.getTime() + FEED_FUTURE_DAYS * 86_400_000) };
}

export interface FeedLinks { webcal: string; google: string; outlook: string }

/** One-click "add this calendar" links for each calendar app, from the https feed URL. */
export function feedLinks(httpsUrl: string, name: string): FeedLinks {
  const webcal = httpsUrl.replace(/^https?:\/\//, "webcal://");
  return {
    webcal,
    google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`,
    outlook: `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(httpsUrl)}&name=${encodeURIComponent(name)}`,
  };
}
