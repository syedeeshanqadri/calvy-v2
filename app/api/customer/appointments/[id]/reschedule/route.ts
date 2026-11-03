import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCustomer } from "@/lib/customerSession";
import { rateLimit } from "@/lib/ratelimit";
import { dateField, timeField, id as idField, parseBody } from "@/lib/validation/common";
import { rescheduleByCustomer } from "@/lib/customerAppointments";
import { moveTokenByCustomer } from "@/lib/customerTokenMove";

export const dynamic = "force-dynamic";

/** A time-slot booking sends a time; a queue token sends the session to join on the new day. */
const body = z.union([
  z.object({ date: dateField, time: timeField }).strict(),
  z.object({ date: dateField, tokenSessionId: idField }).strict(),
]);

// A signed-in, verified customer moves their own booking. The business sees it in its dashboard and is
// notified; the customer gets an email with the new time.
async function POST_handler(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const me = await getCustomer();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!me.verified) return NextResponse.json({ error: "Please verify your email first." }, { status: 403 });
  const rl = await rateLimit(`customer-manage:${me.id}`, 20, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });
  const parsed = await parseBody(req, body);
  if (!parsed.ok) return parsed.res;
  const { id } = await props.params;
  const data = parsed.data;
  if ("tokenSessionId" in data) {
    const t = await moveTokenByCustomer(me.email, id, data.date, data.tokenSessionId);
    if (!t.ok) return NextResponse.json({ error: t.error, code: t.code }, { status: t.status });
    return NextResponse.json({ ok: true, date: t.dateLabel, token: t.token, time: t.estimatedTime });
  }
  const r = await rescheduleByCustomer(me.email, id, data.date, data.time);
  if (!r.ok) return NextResponse.json({ error: r.error, code: r.code }, { status: r.status });
  return NextResponse.json({ ok: true, date: r.dateLabel, time: r.timeLabel });
}

export const POST = safeRoute(POST_handler);
