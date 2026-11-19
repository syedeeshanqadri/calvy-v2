import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { accessSession } from "@/lib/access";
import { isFeatureEnabled } from "@/lib/flags";
import { parseBody } from "@/lib/validation/common";
import { rateLimit } from "@/lib/ratelimit";
import { startCheckout } from "@/lib/subscriptions/service";

export const dynamic = "force-dynamic";

const schema = z.object({ planId: z.enum(["professional", "business"]), interval: z.enum(["MONTHLY", "YEARLY"]), method: z.enum(["upi_card", "enach"]).default("upi_card"), couponCode: z.string().trim().max(40).optional() });

/** Start a new plan or an upgrade (immediate, with the prorated credit). Returns the Cashfree session to open. Owner only, India only. */
async function POST_handler(req: NextRequest) {
  const session = await accessSession("owner");
  if (!session?.user?.businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const businessId = session.user.businessId;
  if (!isFeatureEnabled("onlinePayments")) return NextResponse.json({ error: "Plan payments are not available right now." }, { status: 503 });
  const limit = await rateLimit(`subs-checkout:${businessId}`, 10, 60 * 60_000);
  if (!limit.ok) return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.res;
  const r = await startCheckout({ businessId, ...parsed.data });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ subscriptionId: r.subscriptionId, sessionId: r.sessionId, env: r.env, quote: r.quote, mandate: r.mandate });
}

export const POST = safeRoute(POST_handler);
