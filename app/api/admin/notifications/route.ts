import { NextRequest, NextResponse } from "next/server";
import { isAdminUser } from "@/lib/adminAuth";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendPushToAll, sendPushToBusinessIds } from "@/lib/push";

import { parseBody } from "@/lib/validation/common";
import { adminNotificationSchema } from "@/lib/validation/admin";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const isAdmin = isAdminUser(session?.user);
  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
    console.error("[Admin notifications] Error:", err);
    return NextResponse.json({ error: "Failed to send notifications" }, { status: 500 });
  }
}
