// Live queue tracking for customers: signed links and the public payload (pure).
// The payload is built from queue positions only, never from other customers' details.
import { createHmac, timingSafeEqual } from "node:crypto";
import { computeEtas, openQueue, placeInLine, stateOf, type QueueItem } from "@/lib/queue";

const PURPOSE = "track:v1:";

function secret(env: NodeJS.ProcessEnv = process.env): string | null {
  const s = env.TRACKING_SECRET || env.NEXTAUTH_SECRET;
  if (s) return s;
  return env.NODE_ENV === "production" ? null : "calvy-dev-tracking-secret";
}

const sign = (id: string, key: string) => createHmac("sha256", key).update(PURPOSE + id).digest("base64url");

/** `<appointmentId>.<signature>`: unguessable, no login needed, nothing else encoded. */
export function signTrackingCode(appointmentId: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const key = secret(env);
  return key ? `${appointmentId}.${sign(appointmentId, key)}` : null;
}

/** The appointment id for a valid code, or null (tampered, truncated, wrong key, malformed). */
export function verifyTrackingCode(code: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const key = secret(env);
  if (!key || code.length > 200) return null;
  const dot = code.indexOf(".");
  if (dot < 1) return null;
  const id = code.slice(0, dot);
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) return null;
  const expected = Buffer.from(sign(id, key));
  const given = Buffer.from(code.slice(dot + 1));
  return expected.length === given.length && timingSafeEqual(expected, given) ? id : null;
}

/** Public URL of the tracking page for an appointment (null when no signing key is configured). */
export function trackingUrl(slug: string, appointmentId: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const code = signTrackingCode(appointmentId, env);
  if (!code) return null;
  const base = (env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}/${slug}/q/${code}`;
}

export type TrackingState = "waiting" | "serving" | "done" | "no_show" | "moved" | "cancelled" | "pending_payment" | "expired";

/** What the public page may show. Numbers and labels only: no names, phones, emails or other ids. */
export interface TrackingView {
  state: TrackingState;
  yourToken: number;
  /** Token now being served in this session (null when nobody is). */
  nowServing: number | null;
  /** People ahead of you in the queue (the one being served counts). */
  ahead: number;
  /** 1-based place in line. */
  place: number;
  /** Minutes until your estimated turn (0 when it is your turn or already past). */
  etaMinutes: number | null;
  /** Estimated time of day, HH:MM in the business timezone. */
  etaTime: string | null;
  /** Why a no-show was closed: called twice, or moved once already and could not come again. */
  closedReason: "missed_twice" | "not_coming_again" | null;
  /** You missed your call once and were moved back. */
  movedBack: boolean;
  /** This booking is itself a carry-over from an earlier day. */
  carriedFromEarlier: boolean;
  /** For state "moved": where it went (your own new token). */
  movedTo: { dateLabel: string; token: number; code: string } | null;
}

export interface TrackingSource {
  /** The viewer's own appointment. */
  me: QueueItem & { status: string; estimatedAt: Date | null };
  /** Everyone in the session that day (only the queue fields; never names or contact details). */
  queue: QueueItem[];
  sessionStart: Date;
  minutesPerToken: number;
  servingStartedAt: Date | null;
  now: Date;
  /** Business timezone formatter for HH:MM. */
  formatTime: (d: Date) => string;
  movedTo: TrackingView["movedTo"];
}

/** Whether the appointment is still in the live queue. */
const inQueue = (me: TrackingSource["me"]) => me.status === "confirmed" && ["WAITING", "SERVING"].includes(stateOf(me));

export function buildTrackingView(src: TrackingSource): TrackingView {
  const { me } = src;
  const open = openQueue(src.queue);
  const order = open.map((i) => i.id);
  const serving = open.find((i) => stateOf(i) === "SERVING") ?? null;
  const live = inQueue(me);

  let state: TrackingState;
  if (me.status === "pending_payment") state = "pending_payment";
  else if (me.status === "expired") state = "expired";
  else if (stateOf(me) === "MOVED") state = "moved";
  else if (stateOf(me) === "NO_SHOW") state = "no_show";
  else if (stateOf(me) === "DONE" || me.status === "completed") state = "done";
  else if (me.status === "cancelled") state = "cancelled";
  else state = stateOf(me) === "SERVING" ? "serving" : "waiting";

  const place = live ? placeInLine(order, me.id) : 0;
  const etas = live
    ? computeEtas({ order, servingId: serving?.id ?? null, sessionStart: src.sessionStart, servingStartedAt: src.servingStartedAt, minutesPerToken: src.minutesPerToken })
    : {};
  const eta = etas[me.id] ?? null;

  return {
    state,
    yourToken: me.tokenNumber,
    nowServing: serving?.tokenNumber ?? null,
    ahead: live ? Math.max(0, place - 1) : 0,
    place,
    etaMinutes: eta ? (state === "serving" ? 0 : Math.max(0, Math.round((eta.getTime() - src.now.getTime()) / 60_000))) : null,
    etaTime: eta ? src.formatTime(eta) : null,
    closedReason: state === "no_show" ? (me.notPresentCount >= 2 ? "missed_twice" : "not_coming_again") : null,
    movedBack: live && state === "waiting" && me.notPresentCount > 0,
    carriedFromEarlier: me.carriedFromId !== null,
    movedTo: state === "moved" ? src.movedTo : null,
  };
}
