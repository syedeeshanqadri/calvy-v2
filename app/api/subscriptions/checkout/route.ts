import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { accessSession } from "@/lib/access";
import { isFeatureEnabled } from "@/lib/flags";
import { parseBody } from "@/lib/validation/common";
import { rateLimit } from "@/lib/ratelimit";
import { prisma } from "@/lib/prisma";
import { startCheckout } from "@/lib/subscriptions/service";
import { billingGateway, startIntlCheckout } from "@/lib/subscriptions/razorpayService";

export const dynamic = "force-dynamic";

const schema = z.object({ planId: z.enum(["professional", "business"]), interval: z.enum(["MONTHLY", "YEARLY"]), method: z.enum(["upi_card", "enach"]).default("upi_card"), couponCode: z.string().trim().max(40).optional() });

/** Start a new plan or an upgrade (immediate, with the prorated credit). India: the Cashfree session to open. International: the Razorpay subscription to open (or a payment link in the fallback mode). Owner only. */
async function POST_handler(req: NextRequest) {
  const session = await accessSession("owner");
  if (!session?.user?.businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const businessId = session.user.businessId;
  if (!isFeatureEnabled("onlinePayments")) return NextResponse.json({ error: "Plan payments are not available right now." }, { status: 503 });
  const limit = await rateLimit(`subs-checkout:${businessId}`, 10, 60 * 60_000);
  if (!limit.ok) return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.res;
  const business = await prisma.business.findUnique({ where: { id: businessId }, select: { currency: true } });
  if (!business) return NextResponse.json({ error: "Business not found." }, { status: 404 });
  // Region routing: India -> Cashfree, everywhere else -> Razorpay. Neither path can reach the other.
  if (billingGateway(business) === "RAZORPAY") {
    const x = await startIntlCheckout({ businessId, planId: parsed.data.planId, interval: parsed.data.interval, couponCode: parsed.data.couponCode });
    if (!x.ok) return NextResponse.json({ error: x.error }, { status: x.status });
    return NextResponse.json(x.mode === "RECURRING"
      ? { gateway: "RAZORPAY", mode: "RECURRING", subscriptionId: x.subscriptionId, razorpaySubscriptionId: x.razorpaySubscriptionId, keyId: x.keyId, quote: x.quote }
      : { gateway: "RAZORPAY", mode: "LINKS", subscriptionId: x.subscriptionId, url: x.url, quote: x.quote });
  }
  const r = await startCheckout({ businessId, ...parsed.data });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ subscriptionId: r.subscriptionId, sessionId: r.sessionId, env: r.env, quote: r.quote, mandate: r.mandate });
}

export const POST = safeRoute(POST_handler);
