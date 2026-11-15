import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { accessSession } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/ratelimit";
import { parseBody } from "@/lib/validation/common";
import { deliverPush, isPushConfigured } from "@/lib/push";
import { pushUnsubscribeSchema } from "@/lib/validation/misc";

export const dynamic = "force-dynamic";

/** "Send test notification": one alert to THIS device (named by its endpoint), only if the device belongs to the signed-in person. */
async function POST_handler(req: NextRequest) {
  const session = await accessSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isPushConfigured()) return NextResponse.json({ error: "Phone alerts are not set up on the server yet." }, { status: 503 });
  const rl = await rateLimit(`push-test:${session.access.userId}`, 5, 10 * 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many tests. Try again in a few minutes." }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });

  const parsed = await parseBody(req, pushUnsubscribeSchema); // same shape: { endpoint }
  if (!parsed.ok) return parsed.res;
  if (!parsed.data.endpoint) return NextResponse.json({ error: "This device is not registered. Turn phone alerts on first." }, { status: 400 });
  const device = await prisma.pushDevice.findUnique({ where: { endpoint: parsed.data.endpoint } });
  if (!device || device.userId !== session.access.userId) return NextResponse.json({ error: "This device is not registered. Turn phone alerts on first." }, { status: 404 });

  const t0 = Date.now();
  const out = await deliverPush(device, { title: "Test from Calvy", body: "Phone alerts are working on this device.", url: "/dashboard/alerts", tag: "test", kind: "test" });
  if (out.kind === "sent") {
    await prisma.pushDevice.update({ where: { id: device.id }, data: { lastPushAt: new Date() } }).catch(() => {});
    // A REAL message through the push service (not a local notification): what it answered, and how fast.
    return NextResponse.json({ ok: true, status: out.status ?? 201, ms: Date.now() - t0, host: new URL(device.endpoint).host });
  }
  if (out.kind === "expired" || out.kind === "rejected") {
    await prisma.pushDevice.deleteMany({ where: { id: device.id } });
    const why = out.reason ? ` (${out.reason})` : "";
    return NextResponse.json({ error: `The push service no longer accepts this device${why}. Re-enable alerts on this device.`, code: "REENABLE" }, { status: 410 });
  }
  return NextResponse.json({ error: `The push service did not accept the test (${out.error}). Try again.`, code: "PUSH_ERROR" }, { status: 502 });
}

export const POST = safeRoute(POST_handler);
