import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runQueueAction } from "@/lib/queueDb";
import { queueContext, queueError } from "@/lib/queueApi";
import { dateField, id, parseBody } from "@/lib/validation/common";

export const dynamic = "force-dynamic";

const body = z.object({
  sessionId: id,
  date: dateField,
  action: z.enum(["next", "not_present", "not_coming"]),
  appointmentId: id.optional(),
});

// Next / Not present / Not coming on a session's queue.
async function POST_handler(req: NextRequest) {
  const ctx = await queueContext();
  if (!ctx.ok) return ctx.res;
  const parsed = await parseBody(req, body);
  if (!parsed.ok) return parsed.res;
  try {
    return NextResponse.json(await runQueueAction(ctx.biz, parsed.data));
  } catch (e) {
    return queueError(e);
  }
}

export const POST = safeRoute(POST_handler);
