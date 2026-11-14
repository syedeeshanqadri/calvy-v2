import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { accessSession } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { parseBody } from "@/lib/validation/common";
import { PUSH_DEVICE_COOKIE, pushDeviceCookieOptions } from "@/lib/pushDeviceCookie";
import { pushSubscribeSchema, pushUnsubscribeSchema } from "@/lib/validation/misc";
import { normalizeKey, signingPublicKey } from "@/lib/push";

export const dynamic = "force-dynamic";

/** Register THIS phone/browser for the signed-in user (owner or team member). A device that was someone else's moves to the current user. */
async function POST_handler(req: NextRequest) {
  const session = await accessSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // A Calvy admin looking at a business never registers their phone as one of its devices.
  if (session.user.viewAs) return NextResponse.json({ error: "Not available while viewing as a business." }, { status: 403 });

  const parsed = await parseBody(req, pushSubscribeSchema);
  if (!parsed.ok) return parsed.res;
  const { endpoint, keys, applicationServerKey } = parsed.data;
  // The browser must have subscribed with the key this server SIGNS with, or the push service rejects every message (403).
  // Catching it here turns a silent "alerts never arrive" into a clear message at the moment of enabling.
  const signing = signingPublicKey();
  if (applicationServerKey && signing && normalizeKey(applicationServerKey) !== signing) {
    return NextResponse.json({ error: "This app and the server use different push keys, so phone alerts cannot work yet. Ask the Calvy admin to set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY from one key pair and redeploy.", code: "VAPID_MISMATCH" }, { status: 409 });
  }
  const userAgent = (req.headers.get("user-agent") ?? "").slice(0, 200) || null;

  const device = await prisma.pushDevice.upsert({
    where: { endpoint },
    update: { userId: session.access.userId, businessId: session.access.businessId, p256dh: keys.p256dh, auth: keys.auth, userAgent, lastSeenAt: new Date() },
    create: { userId: session.access.userId, businessId: session.access.businessId, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent },
    select: { id: true },
  });
  const res = NextResponse.json({ ok: true });
  // Names this browser's device, so signing out here removes only this device.
  if (device?.id) res.cookies.set(PUSH_DEVICE_COOKIE, device.id, pushDeviceCookieOptions);
  return res;
}

/** Is this device (endpoint) still registered for the signed-in person? False after the push service rejected or dropped it. */
async function GET_handler(req: NextRequest) {
  const session = await accessSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const endpoint = req.nextUrl.searchParams.get("endpoint") ?? "";
  if (!endpoint || endpoint.length > 1000) return NextResponse.json({ error: "endpoint required" }, { status: 400 });
  const device = await prisma.pushDevice.findUnique({ where: { endpoint }, select: { userId: true } });
  return NextResponse.json({ registered: !!device && device.userId === session.access.userId });
}

/** Turn push off for one device of the signed-in user. */
async function DELETE_handler(req: NextRequest) {
  const session = await accessSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = await parseBody(req, pushUnsubscribeSchema);
  if (!parsed.ok) return parsed.res;
  // No endpoint given = every device of this user (what "turn phone alerts off" on all my devices means).
  await prisma.pushDevice.deleteMany({ where: { userId: session.access.userId, ...(parsed.data.endpoint ? { endpoint: parsed.data.endpoint } : {}) } });
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(PUSH_DEVICE_COOKIE);
  return res;
}

export const GET = safeRoute(GET_handler);
export const POST = safeRoute(POST_handler);
export const DELETE = safeRoute(DELETE_handler);
