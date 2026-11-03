import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { accessSession } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { prefsInputSchema } from "@/lib/notifications/prefs";
import { loadNotificationSettings } from "@/lib/notifications/settings";

export const dynamic = "force-dynamic";

async function GET_handler() {
  const session = await accessSession("notifications.settings");
  if (!session?.user?.businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const settings = await loadNotificationSettings(session.user.businessId);
  if (!settings) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(settings);
}

/** Saves the whole set of switches for the session's own business; reminder leads sorted longest first. */
async function PUT_handler(request: NextRequest) {
  const session = await accessSession("notifications.settings");
  if (!session?.user?.businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = prefsInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const prefs = { ...parsed.data, reminderLeadMinutes: [...parsed.data.reminderLeadMinutes].sort((a, b) => b - a) };
  await prisma.business.update({ where: { id: session.user.businessId }, data: { notificationPrefs: prefs } });
  return NextResponse.json(await loadNotificationSettings(session.user.businessId));
}

export const GET = safeRoute(GET_handler);
export const PUT = safeRoute(PUT_handler);
