import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendPushToAll, sendPushToBusinessIds } from "@/lib/push";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const isAdmin = session?.user?.role === "admin" || session?.user?.email === process.env.SUPER_ADMIN_EMAIL;
  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body2: { title?: string; body?: string; url?: string; targetPlan?: string; targetAll?: boolean };
  try {
    body2 = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { title, body: msg, url, targetPlan, targetAll } = body2;
  if (!title || !msg) {
    return NextResponse.json({ error: "title and body are required" }, { status: 400 });
  }

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
