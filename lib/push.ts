import webpush from "web-push";
import { createECDH } from "crypto";
import https from "https";
import { logger } from "@/lib/logger";
import type { PushKind } from "@/lib/pushRouting";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY ?? "";
const VAPID_SUBJECT_ENV = process.env.VAPID_SUBJECT ?? "";
const DEFAULT_SUBJECT = "https://calvy.io";

/**
 * A VAPID contact the push services accept: https://host... or mailto:name@real.domain. Apple answers BadJwtToken (403) for anything
 * else, while Chrome's FCM does not care, so a corrupted value (for example another variable glued on by a missing newline in an .env
 * file) breaks every iPhone and no Chrome. The host part is therefore checked strictly.
 */
export function isValidVapidSubject(s: string): boolean {
  if (/\s/.test(s)) return false;
  if (s.startsWith("https://")) return /^https:\/\/[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+(:\d+)?(\/[^\s]*)?$/.test(s);
  return /^mailto:[^\s@]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/.test(s);
}
/** The subject actually used: the configured one when valid, otherwise a safe default (and an error is logged). */
export const VAPID_SUBJECT = isValidVapidSubject(VAPID_SUBJECT_ENV) ? VAPID_SUBJECT_ENV : DEFAULT_SUBJECT;
export const subjectFromEnvIsValid = () => isValidVapidSubject(VAPID_SUBJECT_ENV);

export function isPushConfigured() {
  return !!(VAPID_PUBLIC && VAPID_PRIVATE);
}

/** A push service that stops answering must not hold a booking request open (one hung send once held /api/bookings for the full 300s). */
export const SEND_TIMEOUT_MS = 10_000;
const noKeepAlive = new https.Agent({ keepAlive: false });
export const keyFingerprint = (k: string) => (k.length > 12 ? `${k.slice(0, 6)}…${k.slice(-6)}` : "(short)");

const b64uToBuf = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
export const normalizeKey = (s: string) => s.replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

/** The public key that the VAPID PRIVATE key actually signs for. Browsers must subscribe with exactly this one, or every push is rejected (403). */
export function signingPublicKey(): string | null {
  if (!VAPID_PRIVATE) return null;
  try {
    const e = createECDH("prime256v1");
    e.setPrivateKey(b64uToBuf(VAPID_PRIVATE));
    return normalizeKey(e.getPublicKey().toString("base64"));
  } catch { return null; }
}

/** Does NEXT_PUBLIC_VAPID_PUBLIC_KEY belong to VAPID_PRIVATE_KEY in THIS environment? false = guaranteed push failures. */
export function vapidPairMatches(): boolean {
  const derived = signingPublicKey();
  return !!derived && !!VAPID_PUBLIC && normalizeKey(VAPID_PUBLIC) === derived;
}

if (isPushConfigured()) {
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
    if (!subjectFromEnvIsValid()) logger.error(`[Push] VAPID_SUBJECT is not a valid mailto:/https: contact (${VAPID_SUBJECT_ENV ? "malformed" : "unset"}): using ${DEFAULT_SUBJECT}. Apple rejects push with BadJwtToken otherwise.`);
    if (!vapidPairMatches()) logger.error("[Push] VAPID_PRIVATE_KEY does not belong to NEXT_PUBLIC_VAPID_PUBLIC_KEY: every push will be rejected (403). Set both from one key pair and redeploy.");
  } catch (err) {
    logger.error("[Push] Invalid VAPID keys:", { err });
  }
}

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  url?: string;
  tag?: string;
  /** Which alert this is (booking_new, queue...): the app groups repeated alerts of one kind into "3 new bookings". */
  kind?: string;
}

/**
 * expired: the browser dropped the subscription (404/410). rejected: the push service refused OUR signature for this device (401/403:
 * VapidPkHashMismatch, BadJwtToken...): the subscription was made with a different key pair, so it can never work. Both carry the
 * push service's own reason so the delivery log can show it.
 */
export type PushOutcome = { kind: "sent"; status?: number } | { kind: "expired"; reason?: string } | { kind: "rejected"; reason: string } | { kind: "retry" | "permanent"; error: string };

/** The push service's own words: Apple answers {"reason":"BadJwtToken"}, FCM plain text. Never contains our keys. */
export function reasonOf(err: unknown): string {
  const status = (err as { statusCode?: number }).statusCode;
  const body = String((err as { body?: unknown }).body ?? "").replace(/\s+/g, " ").trim();
  let reason = body;
  try { const j = JSON.parse(body) as { reason?: string; error?: { message?: string } }; reason = j.reason ?? j.error?.message ?? body; } catch { /* plain text */ }
  return `${status ?? "error"}${reason ? ` ${reason.slice(0, 140)}` : ""}`;
}

/**
 * One web-push send to one device. 404 and 410 mean the browser dropped the subscription: the caller deletes the device.
 * Other 4xx (except 408/429) are permanent for this message; everything else is worth a retry.
 */
export async function deliverPush(sub: { endpoint: string; p256dh: string; auth: string }, payload: PushPayload): Promise<PushOutcome> {
  if (!isPushConfigured()) return { kind: "permanent", error: "push not configured" };
  try {
    const res = await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), { TTL: 60 * 60 * 24, timeout: SEND_TIMEOUT_MS, agent: noKeepAlive });
    return { kind: "sent", status: res.statusCode };
  } catch (err: unknown) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return { kind: "expired", reason: reasonOf(err) };
    if (status === 401 || status === 403) return { kind: "rejected", reason: reasonOf(err) };
    const retryable = status === undefined || status === 408 || status === 429 || status >= 500;
    return { kind: retryable ? "retry" : "permanent", error: `push service ${reasonOf(err)}` };
  }
}

export interface PushOptions {
  /** Which preference and permission decide who gets it. Default: a new booking. */
  kind?: PushKind;
  /** Whose appointment it is (own-only members get only their own). */
  staffId?: string | null;
  /** With `version`: the same event on the same subject is one alert per device. */
  subjectId?: string;
  version?: string | number;
}

/**
 * A business event: the in-app notification (the bell panel) and a phone alert to each device whose owner may see it and wants it.
 * Phone alerts go through the notification outbox (lib/pushQueue). Text is name + time + service only: contact details are scrubbed.
 */
export async function sendPushToBusiness(businessId: string, payload: PushPayload, opts: PushOptions = {}) {
  const { prisma } = await import("@/lib/prisma");
  const { queuePush } = await import("@/lib/pushQueue");
  const { scrubContact } = await import("@/lib/pushRouting");

  // Always store notification in DB so the panel shows it even without push subscription
  await prisma.notification.create({
    data: { businessId, title: scrubContact(payload.title), body: scrubContact(payload.body), url: payload.url ?? "/dashboard" },
  }).catch(() => {});

  const kind = opts.kind ?? "booking_new";
  await queuePush({
    businessId, kind, staffId: opts.staffId, subjectId: opts.subjectId ?? `${kind}:${payload.tag ?? payload.title}:${Date.now()}`, version: opts.version,
    message: { title: payload.title, body: payload.body, url: payload.url, tag: payload.tag },
  });
}

/** A Calvy announcement to every owner device of the given businesses (or of all of them). */
export async function sendPushToBusinessIds(businessIds: string[] | null, payload: PushPayload) {
  const { prisma } = await import("@/lib/prisma");
  const { queuePush } = await import("@/lib/pushQueue");
  const ids = businessIds ?? (await prisma.business.findMany({ select: { id: true } })).map((b) => b.id);
  const stamp = Date.now();
  for (const id of ids) {
    await queuePush({ businessId: id, kind: "announcement", subjectId: `announcement:${stamp}`, message: payload });
  }
}

export async function sendPushToAll(payload: PushPayload) {
  await sendPushToBusinessIds(null, payload);
}


/** What the admin health check reports about the server's push configuration: fingerprints and yes/no only, never a key. */
export function vapidHealth() {
  const derived = signingPublicKey();
  return {
    configured: isPushConfigured(),
    publicKeyFingerprint: VAPID_PUBLIC ? keyFingerprint(normalizeKey(VAPID_PUBLIC)) : null,
    signingKeyFingerprint: derived ? keyFingerprint(derived) : null,
    privateKeyMatchesPublic: vapidPairMatches(),
    subjectConfiguredValid: subjectFromEnvIsValid(),
    subjectInUse: VAPID_SUBJECT.startsWith("mailto:") ? `mailto:***@${VAPID_SUBJECT.split("@")[1]}` : VAPID_SUBJECT,
    subjectScheme: VAPID_SUBJECT.split(":")[0] + ":",
  };
}
