import { safeRoute } from "@/lib/api";
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { prisma } from "@/lib/prisma";
import { vapidHealth } from "@/lib/push";

export const dynamic = "force-dynamic";

/**
 * Phone-alert health for the super admin only: is the server's VAPID configuration usable, and which key did each registered device
 * subscribe with. Fingerprints (first/last 6 characters) and yes/no only: never a key, a subscription endpoint or a contact address.
 */
async function GET_handler() {
  const gate = await requireAdminApi();
  if (!gate.ok) return gate.res;

  const health = vapidHealth();
  const devices = await prisma.pushDevice.groupBy({ by: ["keyFp"], _count: { _all: true } });
  const current = health.signingKeyFingerprint;
  const byKey = devices.map((d) => ({ keyFingerprint: d.keyFp ?? "unknown (made before keys were recorded)", devices: d._count._all, matchesServerKey: !!d.keyFp && d.keyFp === current }));
  const since = new Date(Date.now() - 24 * 3_600_000);
  const recent = await prisma.notificationOutbox.groupBy({ by: ["status"], where: { channel: "PUSH", createdAt: { gte: since } }, _count: { _all: true } });
  const problems: string[] = [];
  if (!health.configured) problems.push("VAPID keys are not set.");
  if (health.configured && !health.privateKeyMatchesPublic) problems.push("VAPID_PRIVATE_KEY does not belong to NEXT_PUBLIC_VAPID_PUBLIC_KEY: every push is rejected. Set both from one pair and redeploy.");
  if (!health.subjectConfiguredValid) problems.push("VAPID_SUBJECT is not a valid mailto:/https: contact: Apple rejects such pushes (BadJwtToken). A safe default is being used until it is fixed.");
  const stale = byKey.filter((k) => !k.matchesServerKey).reduce((n, k) => n + k.devices, 0);
  if (stale) problems.push(`${stale} registered device(s) were made with another key (or before keys were recorded) and need Re-enable alerts.`);
  return NextResponse.json({ ok: problems.length === 0, problems, server: health, devicesByKey: byKey, pushLast24h: Object.fromEntries(recent.map((r) => [r.status, r._count._all])) }, { headers: { "Cache-Control": "no-store" } });
}

export const GET = safeRoute(GET_handler);
