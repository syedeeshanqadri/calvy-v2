// The in-app alert bus: anything that learns about a new booking or queue event while the app is open emits one alert here (a push message
// forwarded by the service worker, or the bell poll noticing a new notification). One listener (components/dashboard/AlertCenter) turns it
// into the chime, the vibration and the on-screen card.
export const ALERT_EVENT = "calvy:alert";
export interface AlertDetail { title: string; body: string; url: string; kind?: string }

/** Same booking = same key, whichever route reported it. */
export const alertKey = (d: AlertDetail) => (d.url.includes("open=") ? d.url : `${d.title}|${d.body}`);

export function emitAlert(d: AlertDetail) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent<AlertDetail>(ALERT_EVENT, { detail: d }));
}

/** Only these are worth a chime: new bookings, queue changes, cancellations, reschedules, payments. Reminders and summaries are not. */
export const CHIME_KINDS = new Set(["booking_new", "booking_cancelled", "booking_rescheduled", "queue", "payment"]);
export const shouldChime = (kind: string | undefined) => !kind || CHIME_KINDS.has(kind);
