import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { accessSession } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { parseBody } from "@/lib/validation/common";
import { PUSH_DEVICE_COOKIE, pushDeviceCookieOptions } from "@/lib/pushDeviceCookie";
import { pushSubscribeSchema, pushUnsubscribeSchema } from "@/lib/validation/misc";

export const dynamic = "force-dynamic";

/** Register THIS phone/browser for the signed-in user (owner or team member). A device that was someone else's moves to the current user. */
async function POST_handler(req: NextRequest) {
  const session = await accessSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // A Calvy admin looking at a business never registers their phone as one of its devices.
  if (session.user.viewAs) return NextResponse.json({ error: "Not available while viewing as a business." }, { status: 403 });

  const parsed = await parseBody(req, pushSubscribeSchema);
  if (!parsed.ok) return parsed.res;
  const { endpoint, keys } = parsed.data;
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

export const POST = safeRoute(POST_handler);
export const DELETE = safeRoute(DELETE_handler);
