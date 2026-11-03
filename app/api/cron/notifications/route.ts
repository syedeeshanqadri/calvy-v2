import { safeRoute } from "@/lib/api";
import { isCronAuthorized } from "@/lib/cronAuth";
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { releaseExpiredHolds } from "@/lib/onlinePayment";
import { runOutbox } from "@/lib/notifications/process";
import { enqueueDueReminders } from "@/lib/notifications/reminders";
import { enqueueDailySummaries } from "@/lib/notifications/summary";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** One step failing (a bad row, a DB blip) must not stop the others; -1 in the reply marks it. */
const step = (name: string, run: () => Promise<number>) =>
  run().catch((err) => {
    logger.error(`[Cron] ${name} failed`, { err });
    return -1;
  });

// Called every 2 minutes by cron-job.org, daily by Vercel as a backstop (docs/notifications-setup.md).
// Order: expire unpaid holds (so they get no reminder), queue due reminders and morning summaries, then send.
async function GET_handler(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const expiredHolds = await step("hold sweep", () => releaseExpiredHolds());
  const remindersQueued = await step("reminder sweep", () => enqueueDueReminders());
  const summariesQueued = await step("daily summaries", () => enqueueDailySummaries());
  return NextResponse.json({ ok: true, expiredHolds, remindersQueued, summariesQueued, ...(await runOutbox()) });
}

export const GET = safeRoute(GET_handler);
