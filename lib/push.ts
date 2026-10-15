import webpush from "web-push";
import { logger } from "@/lib/logger";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY ?? "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:support@calvy.io";

function isConfigured() {
  return !!(VAPID_PUBLIC && VAPID_PRIVATE);
}

if (isConfigured()) {
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

export async function sendPushToSubscription(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: PushPayload
) {
  if (!isConfigured()) return;
  try {
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
      JSON.stringify(payload),
      { TTL: 60 * 60 * 24 }
    );
  } catch (err: unknown) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 410 || status === 404) {
      // Subscription expired — caller should delete from DB
      throw Object.assign(new Error("expired"), { expired: true });
    }
    logger.error("[Push] Send failed:", { err });
  }
}

export async function sendPushToBusiness(businessId: string, payload: PushPayload) {
  const { prisma } = await import("@/lib/prisma");

  // Always store notification in DB so the panel shows it even without push subscription
  await prisma.notification.create({
    data: {
      businessId,
      title: payload.title,
      body: payload.body,
      url: payload.url ?? "/dashboard",
    },
  }).catch(() => {});

  if (!isConfigured()) return;
  const subs = await prisma.pushSubscription.findMany({ where: { businessId } });
  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await sendPushToSubscription({ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth }, payload);
      } catch (err: unknown) {
        if ((err as { expired?: boolean }).expired) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } });
        }
      }
    })
  );
}

export async function sendPushToAll(payload: PushPayload) {
  if (!isConfigured()) return;
  const { prisma } = await import("@/lib/prisma");
  const subs = await prisma.pushSubscription.findMany();
  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await sendPushToSubscription({ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth }, payload);
      } catch (err: unknown) {
        if ((err as { expired?: boolean }).expired) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } });
        }
      }
    })
  );
}

export async function sendPushToBusinessIds(businessIds: string[], payload: PushPayload) {
  if (!isConfigured()) return;
  const { prisma } = await import("@/lib/prisma");
  const subs = await prisma.pushSubscription.findMany({ where: { businessId: { in: businessIds } } });
  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await sendPushToSubscription({ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth }, payload);
      } catch (err: unknown) {
        if ((err as { expired?: boolean }).expired) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } });
        }
      }
    })
  );
}
