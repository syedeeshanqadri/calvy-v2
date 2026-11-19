import { safeRoute } from "@/lib/api";
import { isCronAuthorized } from "@/lib/cronAuth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { processDueDeletions } from "@/lib/accountDeletion";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Daily: anonymise every customer whose 30-day deletion grace period is over. Same secret check as the notifications cron. */
async function GET_handler(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true, ...(await processDueDeletions(prisma)) });
}

export const GET = safeRoute(GET_handler);
