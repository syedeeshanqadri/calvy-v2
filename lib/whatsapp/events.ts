// Which email event becomes which WhatsApp template, and how its variables are filled (pure, unit-tested).
// Customer messages are cloned from the email's payload, so a WhatsApp message can never say more than the email did.

export const WA_PREF_KEYS = ["confirmations", "changes", "reminders", "token", "turnSoon", "receipts", "thanks", "followUp"] as const;
export type WaPrefKey = (typeof WA_PREF_KEYS)[number];

export const WA_PREF_LABELS: Record<WaPrefKey, string> = {
  confirmations: "Booking confirmations and joining links",
  changes: "Rescheduled, cancelled and missed bookings",
  reminders: "Reminders",
  token: "Token queue: moved back or closed",
  turnSoon: "Token queue: your turn is coming up",
  receipts: "Payment receipts",
  thanks: "Thank-you after a visit",
  followUp: "Free follow-up deadline inside the thank-you (clinics)",
};

/** Everything is on by default. Review requests are email only: Meta treats them as marketing. */
export const WA_PREF_DEFAULTS: Record<WaPrefKey, boolean> = {
  confirmations: true, changes: true, reminders: true, token: true, turnSoon: true, receipts: true, thanks: true, followUp: true,
};

export interface WaMessage { key: string; params: string[]; buttonSuffix?: string }

interface BookingLike {
  clientName?: string; businessName?: string; providerName?: string; serviceName?: string; date?: string; time?: string;
  token?: { number: number; estimatedTime: string; sessionName: string; sessionStart?: string };
  trackUrl?: string; meetingUrl?: string; place?: number; followUpUntil?: string;
}

/** Meta rejects empty variables and variables with newlines, tabs or runs of spaces. */
export const clean = (v: unknown, fallback = "-"): string => {
  const t = String(v ?? "").replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim().slice(0, 200);
  return t || fallback;
};
const first = (name?: string) => clean((name ?? "").trim().split(/\s+/)[0], "there");
const when = (p: BookingLike) => clean(`${p.date ?? ""}${p.date && p.time ? ", " : ""}${p.time ?? ""}`);
/** The tracking page address ends in /q/<code>; the template button holds the fixed part, so only the code is sent. */
const trackCode = (url?: string) => (url ? url.split("/q/")[1]?.split(/[?#]/)[0] || undefined : undefined);
const booking = (key: string, p: BookingLike): WaMessage => ({ key, params: [first(p.clientName), clean(p.serviceName), clean(p.businessName), when(p)] });

interface Mapping { pref: WaPrefKey; build: (p: BookingLike) => WaMessage | null }

/** One entry per customer email event. Events missing here have no WhatsApp message (accounts, platform mail). */
export const WA_EVENTS: Record<string, Mapping> = {
  "booking.created": {
    pref: "confirmations",
    build: (p) => {
      if (!p.token) return booking("booking_confirmed", p);
      const suffix = trackCode(p.trackUrl);
      return suffix ? { key: "token_issued", params: [first(p.clientName), clean(p.businessName), clean(p.token.number), clean(p.token.estimatedTime)], buttonSuffix: suffix } : null;
    },
  },
  "booking.meeting_link": {
    pref: "confirmations",
    build: (p) => (p.meetingUrl ? { key: "booking_meeting_link", params: [...booking("x", p).params, clean(p.meetingUrl)] } : null),
  },
  "booking.rescheduled": { pref: "changes", build: (p) => booking("booking_rescheduled", p) },
  "booking.cancelled": { pref: "changes", build: (p) => booking("booking_cancelled", p) },
  "booking.no_show": { pref: "changes", build: (p) => booking("booking_no_show", p) },
  "booking.reminder": { pref: "reminders", build: (p) => booking("booking_reminder", p) },
  "booking.paid": { pref: "receipts", build: (p) => booking("payment_received", p) },
  // One message: the thank-you carries the free follow-up deadline when there is one (never a separate follow-up message).
  "booking.completed": {
    pref: "thanks",
    build: (p) => {
      const base = [first(p.clientName), clean(p.businessName), when(p)];
      return p.followUpUntil ? { key: "visit_thanks_follow_up", params: [...base, clean(p.providerName ?? p.businessName), clean(p.followUpUntil)] } : { key: "visit_thanks", params: base };
    },
  },
  "booking.queue_next": {
    pref: "turnSoon",
    build: (p) => {
      const suffix = trackCode(p.trackUrl);
      return p.token && suffix ? { key: "token_next", params: [first(p.clientName), clean(p.businessName), clean(p.token.number)], buttonSuffix: suffix } : null;
    },
  },
  "booking.queue_moved_back": {
    pref: "token",
    build: (p) => {
      const suffix = trackCode(p.trackUrl);
      return p.token && suffix ? { key: "token_moved_back", params: [first(p.clientName), clean(p.businessName), clean(p.token.number), clean(p.place)], buttonSuffix: suffix } : null;
    },
  },
  "booking.queue_closed": { pref: "token", build: (p) => (p.token ? { key: "token_closed", params: [first(p.clientName), clean(p.businessName), clean(p.token.number)] } : null) },
};

/** Email event names that get a WhatsApp clone. */
export const isWhatsAppEvent = (event: string) => event in WA_EVENTS;

/** Business alert (push kind) -> the one generic alert template; the variable is the already-scrubbed alert text. */
export const STAFF_ALERT_KINDS = new Set(["booking_new", "booking_cancelled", "booking_rescheduled", "payment"]);

export function buildWhatsAppMessage(event: string, payload: unknown, audience: string): WaMessage | null {
  if (audience === "BUSINESS") {
    const p = payload as { title?: string; body?: string; businessName?: string };
    if (!event.startsWith("push.") || !p.body) return null;
    return { key: "staff_alert", params: [clean(p.businessName, "your business"), clean(`${p.title ? p.title + ": " : ""}${p.body}`.replace(/[.]*$/, "") + ".")], buttonSuffix: "appointments" };
  }
  return WA_EVENTS[event]?.build((payload ?? {}) as BookingLike) ?? null;
}

/** The "Send test message" / "verify my number" message. connection_test was reclassified as MARKETING twice, so it rides on the approved staff_alert template. */
export function connectionTestMessage(businessName: string): WaMessage {
  const name = clean(businessName, "your business");
  return { key: "staff_alert", params: [name, `WhatsApp connection test for ${name}.`], buttonSuffix: "appointments" };
}
