// Opening-hours block and map embed for the public website.

export interface HoursRow { weekday: number; startMin: number; endMin: number }
export interface HoursLine { weekday: number; day: string; label: string; closed: boolean }

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function formatMinutes(min: number): string {
  const h24 = Math.floor(min / 60) % 24;
  const m = min % 60;
  const suffix = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** One line per day, Monday first. Several ranges on a day are joined; no rows = Closed. */
export function formatOpeningHours(rows: HoursRow[]): HoursLine[] {
  return [1, 2, 3, 4, 5, 6, 0].map((weekday) => {
    const ranges = rows
      .filter((r) => r.weekday === weekday && r.endMin > r.startMin)
      .sort((a, b) => a.startMin - b.startMin)
      .map((r) => `${formatMinutes(r.startMin)} – ${formatMinutes(r.endMin)}`);
    return { weekday, day: DAY_NAMES[weekday], label: ranges.length ? ranges.join(", ") : "Closed", closed: ranges.length === 0 };
  });
}

/** Keyless Google Maps embed for an address. */
export function mapsEmbedUrl(address: string): string {
  return `https://www.google.com/maps?q=${encodeURIComponent(address.trim().slice(0, 300))}&output=embed`;
}

export interface OpenStatus { weekday: number; open: boolean; label: string }

/** Local weekday (0 = Sunday) and minutes since midnight in an IANA timezone. */
function localNow(timeZone: string, now: Date): { weekday: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { weekday, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

/** "Open now, until 6:00 PM" / "Closed now, opens 5:00 PM" / "Closed today", in the business timezone. */
export function openStatus(rows: HoursRow[], timeZone: string, now: Date = new Date()): OpenStatus {
  let local: { weekday: number; minutes: number };
  try { local = localNow(timeZone, now); } catch { local = localNow("UTC", now); }
  const today = rows.filter((r) => r.weekday === local.weekday && r.endMin > r.startMin).sort((a, b) => a.startMin - b.startMin);
  const current = today.find((r) => local.minutes >= r.startMin && local.minutes < r.endMin);
  if (current) return { weekday: local.weekday, open: true, label: `Open now, until ${formatMinutes(current.endMin)}` };
  const later = today.find((r) => r.startMin > local.minutes);
  if (later) return { weekday: local.weekday, open: false, label: `Closed now, opens ${formatMinutes(later.startMin)}` };
  return { weekday: local.weekday, open: false, label: today.length ? "Closed for today" : "Closed today" };
}
