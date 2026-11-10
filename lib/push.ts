import { SUPPORT_EMAIL } from "@/lib/site";
import webpush from "web-push";
import { logger } from "@/lib/logger";
import type { PushKind } from "@/lib/pushRouting";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY ?? "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? `mailto:${SUPPORT_EMAIL}`;

export function isPushConfigured() {
  return !!(VAPID_PUBLIC && VAPID_PRIVATE);
}

if (isPushConfigured()) {
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
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
}

export type PushOutcome = { kind: "sent" } | { kind: "expired" } | { kind: "retry" | "permanent"; error: string };

/**
 * One web-push send to one device. 404 and 410 mean the browser dropped the subscription: the caller deletes the device.
 * Other 4xx (except 408/429) are permanent for this message; everything else is worth a retry.
 */
export async function deliverPush(sub: { endpoint: string; p256dh: string; auth: string }, payload: PushPayload): Promise<PushOutcome> {
  if (!isPushConfigured()) return { kind: "permanent", error: "push not configured" };
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), { TTL: 60 * 60 * 24 });
    return { kind: "sent" };
  } catch (err: unknown) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return { kind: "expired" };
    const retryable = status === undefined || status === 408 || status === 429 || status >= 500;
    return { kind: retryable ? "retry" : "permanent", error: `push service ${status ?? "error"}` };
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
