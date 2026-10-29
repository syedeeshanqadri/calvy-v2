import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { getCustomer } from "@/lib/customerSession";
import { rateLimit } from "@/lib/ratelimit";
import { cancelByCustomer } from "@/lib/customerAppointments";

export const dynamic = "force-dynamic";

// A signed-in, verified customer cancels their own booking. The business sees it in its dashboard and is
// notified; the customer gets a cancellation email. Whatever was paid online becomes wallet credit.
async function POST_handler(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const me = await getCustomer();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!me.verified) return NextResponse.json({ error: "Please verify your email first." }, { status: 403 });
  const rl = await rateLimit(`customer-manage:${me.id}`, 20, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });
  const { id } = await props.params;
  const r = await cancelByCustomer(me.email, id);
  if (!r.ok) return NextResponse.json({ error: r.error, code: r.code }, { status: r.status });
  return NextResponse.json({ ok: true, credit: r.credit });
}

export const POST = safeRoute(POST_handler);
