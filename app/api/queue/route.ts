import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { loadQueue, loadQueueSessions } from "@/lib/queueDb";
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
    const sessions = await loadQueueSessions(ctx.biz.id, q.data.date);
    const chosen = q.data.sessionId ?? sessions[0]?.id;
    const queue = chosen && sessions.some((s) => s.id === chosen) ? await loadQueue(ctx.biz, chosen, q.data.date) : null;
    return NextResponse.json({ sessions, queue });
  } catch (e) {
    return queueError(e);
  }
}

export const GET = safeRoute(GET_handler);
