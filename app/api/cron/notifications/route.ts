import { safeRoute } from "@/lib/api";
import { isCronAuthorized } from "@/lib/cronAuth";
import { NextRequest, NextResponse } from "next/server";
import { runOutbox } from "@/lib/notifications/process";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Called every 2 minutes by cron-job.org, daily by Vercel as a backstop (docs/notifications-setup.md).
async function GET_handler(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, ...(await runOutbox()) });
}

export const GET = safeRoute(GET_handler);
