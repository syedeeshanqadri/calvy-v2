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
