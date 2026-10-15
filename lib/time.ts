// Timezone helpers (Intl only, no dependency). Instants are UTC `Date`s; a
// business's wall-clock day/time lives in its IANA zone (`Business.timezone`).
// All conversions are DST-safe because the zone offset is looked up for the
// instant in question, never assumed.

export const DEFAULT_TIMEZONE = "Asia/Kolkata";

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The zone if valid, otherwise the default (bad stored values never throw). */
export function safeTimeZone(tz: unknown): string {
  return isValidTimeZone(tz) ? tz : DEFAULT_TIMEZONE;
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function parts(date: Date, tz: string) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    fmtCache.set(tz, f);
  }
  const o: Record<string, number> = {};
  for (const p of f.formatToParts(date)) if (p.type !== "literal") o[p.type] = Number(p.value);
  return o;
}

/** Zone offset from UTC in minutes at the given instant (IST = 330). */
export function tzOffsetMinutes(date: Date, tz: string): number {
  const p = parts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60_000);
}

const pad = (n: number) => String(n).padStart(2, "0");

export function parseYMD(dateStr: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const chk = new Date(Date.UTC(y, mo - 1, d));
  if (chk.getUTCFullYear() !== y || chk.getUTCMonth() !== mo - 1 || chk.getUTCDate() !== d) return null;
  return { y, m: mo, d };
}

/** UTC instant of a wall-clock day ("YYYY-MM-DD") and minutes-since-midnight in `tz`. */
export function zonedToUtc(dateStr: string, minutes: number, tz: string): Date {
  const ymd = parseYMD(dateStr);
  if (!ymd) return new Date(NaN);
  const guess = Date.UTC(ymd.y, ymd.m - 1, ymd.d, 0, minutes);
  let t = guess - tzOffsetMinutes(new Date(guess), tz) * 60_000;
  const off2 = tzOffsetMinutes(new Date(t), tz);
  const t2 = guess - off2 * 60_000;
  if (t2 !== t) t = t2;
  return new Date(t);
}

/** Wall-clock "HH:MM" -> UTC instant on the given zone day. */
export function zonedTimeToUtc(dateStr: string, time: string, tz: string): Date {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!m) return new Date(NaN);
  return zonedToUtc(dateStr, Number(m[1]) * 60 + Number(m[2]), tz);
}

/** [start, end) UTC window of a whole zone day (23h/25h on DST days). */
export function zonedDayRange(dateStr: string, tz: string): { start: Date; end: Date } {
  const start = zonedToUtc(dateStr, 0, tz);
  const next = addDays(dateStr, 1);
  return { start, end: zonedToUtc(next, 0, tz) };
}

/** Calendar-day arithmetic on "YYYY-MM-DD" (no zone involved). */
export function addDays(dateStr: string, days: number): string {
  const ymd = parseYMD(dateStr);
  if (!ymd) return dateStr;
  const d = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d + days));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Weekday 0 (Sun) to 6 (Sat) of a calendar day. */
export function weekdayOf(dateStr: string): number {
  const ymd = parseYMD(dateStr);
  return ymd ? new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d)).getUTCDay() : 0;
}

export interface ZonedParts {
  date: string; // YYYY-MM-DD in the zone
  time: string; // HH:MM in the zone
  minutes: number; // minutes since local midnight
  weekday: number;
}

/** The wall-clock day/time of an instant in `tz`. */
export function utcToZoned(instant: Date, tz: string): ZonedParts {
  const p = parts(instant, tz);
  const date = `${p.year}-${pad(p.month)}-${pad(p.day)}`;
  return { date, time: `${pad(p.hour)}:${pad(p.minute)}`, minutes: p.hour * 60 + p.minute, weekday: weekdayOf(date) };
}

/** "Tuesday, October 6" in the zone. */
export function formatDateLabel(instant: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric" }).format(instant);
}

/** "2:30 PM" in the zone. */
export function formatTimeLabel(instant: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(instant);
}
