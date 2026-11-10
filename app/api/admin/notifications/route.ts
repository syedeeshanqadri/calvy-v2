import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { prisma } from "@/lib/prisma";
import { sendPushToAll, sendPushToBusinessIds } from "@/lib/push";

import { parseBody } from "@/lib/validation/common";
import { adminNotificationSchema } from "@/lib/validation/admin";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

async function POST_handler(req: NextRequest) {
  const gate = await requireAdminApi();
  if (!gate.ok) return gate.res;

  const parsed = await parseBody(req, adminNotificationSchema);
  if (!parsed.ok) return parsed.res;
  const { title, body: msg, url, targetPlan, targetAll } = parsed.data;

  const payload = { title, body: msg, icon: "/icon.svg", url: url || "/dashboard" };

  try {
    if (targetAll) {
      await sendPushToAll(payload);
      return NextResponse.json({ ok: true, sent: "all" });
    }

    if (targetPlan) {
      const businesses = await prisma.business.findMany({
        where: { plan: targetPlan },
        select: { id: true },
      });
      await sendPushToBusinessIds(businesses.map((b) => b.id), payload);
      return NextResponse.json({ ok: true, sent: businesses.length });
    }

    return NextResponse.json({ error: "Specify targetAll or targetPlan" }, { status: 400 });
  } catch (err) {
    logger.error("[Admin notifications] Error:", { err });
    return NextResponse.json({ error: "Failed to send notifications" }, { status: 500 });
  }
}

export const POST = safeRoute(POST_handler);
