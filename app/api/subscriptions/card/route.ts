import { safeRoute } from "@/lib/api";
import { NextResponse } from "next/server";
import { accessSession } from "@/lib/access";
import { rateLimit } from "@/lib/ratelimit";
import { startCardUpdate } from "@/lib/subscriptions/razorpayService";

export const dynamic = "force-dynamic";

/** "Update card" (international, Razorpay): a replacement subscription that starts at the current period end, so nothing is charged twice. Owner only. */
async function POST_handler() {
  const session = await accessSession("owner");
  if (!session?.user?.businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limit = await rateLimit(`subs-card:${session.user.businessId}`, 10, 60 * 60_000);
  if (!limit.ok) return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  const r = await startCardUpdate({ businessId: session.user.businessId });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ razorpaySubscriptionId: r.razorpaySubscriptionId, keyId: r.keyId });
}

export const POST = safeRoute(POST_handler);
