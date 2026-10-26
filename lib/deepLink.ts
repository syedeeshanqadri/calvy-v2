export interface BookingDeepLink { serviceId: string; date: string | null; time: string | null }

/**
 * Reads `?service=…&date=YYYY-MM-DD&time=HH:MM` from a booking link (the "next available" chips on the
 * website use it). Anything malformed, or a date in the past, is ignored, so a bad link just opens the
 * normal first step. `today` is YYYY-MM-DD in the visitor's local calendar.
 */
export function parseBookingDeepLink(params: { get(name: string): string | null } | null | undefined, today: string): BookingDeepLink | null {
  const serviceId = params?.get("service")?.trim();
  if (!serviceId) return null;
  const rawDate = params?.get("date")?.trim() ?? "";
  const rawTime = params?.get("time")?.trim() ?? "";
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(rawDate);
  const real = d && new Date(Date.UTC(+d[1], +d[2] - 1, +d[3])).toISOString().slice(0, 10) === rawDate;
  const date = real && rawDate >= today ? rawDate : null;
  const time = date && /^([01]\d|2[0-3]):[0-5]\d$/.test(rawTime) ? rawTime : null;
  return { serviceId, date, time };
}
