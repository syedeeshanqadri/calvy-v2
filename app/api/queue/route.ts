import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { loadQueueScreen } from "@/lib/queueDb";
import { queueContext, queueError } from "@/lib/queueApi";
import { dateField, id, parseQuery } from "@/lib/validation/common";

export const dynamic = "force-dynamic";

const query = z.object({ date: dateField, sessionId: id.optional() });

// Reception queue: the sessions running on a date and, for the chosen one, the live queue.
async function GET_handler(req: NextRequest) {
  const ctx = await queueContext();
  if (!ctx.ok) return ctx.res;
  const q = parseQuery(req.url, query);
  if (!q.ok) return q.res;
  try {
    return NextResponse.json(await loadQueueScreen(ctx.biz, q.data.date, q.data.sessionId));
  } catch (e) {
    return queueError(e);
  }
}

export const GET = safeRoute(GET_handler);
