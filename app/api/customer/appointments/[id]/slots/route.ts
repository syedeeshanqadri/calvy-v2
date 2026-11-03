import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCustomer } from "@/lib/customerSession";
import { rateLimit } from "@/lib/ratelimit";
import { dateField, parseQuery } from "@/lib/validation/common";
import { findOwned, rescheduleSlots } from "@/lib/customerAppointments";
import { tokenMoveOptions } from "@/lib/customerTokenMove";

export const dynamic = "force-dynamic";

const query = z.object({ date: dateField });

// A signed-in, verified customer: the times (or, for a queue token, the sessions) their own booking could move to on one day.
async function GET_handler(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const me = await getCustomer();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!me.verified) return NextResponse.json({ error: "Please verify your email first." }, { status: 403 });
  const rl = await rateLimit(`customer-slots:${me.id}`, 60, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });
  const q = parseQuery(req.url, query);
  if (!q.ok) return q.res;
  const { id } = await props.params;
  const owned = await findOwned(me.email, id);
  if (owned?.tokenNumber) {
    const t = await tokenMoveOptions(me.email, id, q.data.date);
    if (!t.ok) return NextResponse.json({ error: t.error, code: t.code }, { status: t.status });
    return NextResponse.json({ sessions: t.sessions });
  }
  const r = await rescheduleSlots(me.email, id, q.data.date);
  if (!r.ok) return NextResponse.json({ error: r.error, code: r.code }, { status: r.status });
  return NextResponse.json({ times: r.times });
}

export const GET = safeRoute(GET_handler);
