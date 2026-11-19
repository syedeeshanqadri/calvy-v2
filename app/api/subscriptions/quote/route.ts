import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { accessSession } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { parseQuery } from "@/lib/validation/common";
import { mandateCheck } from "@/lib/subscriptions/rules";
import { quoteFor } from "@/lib/subscriptions/service";
import { billingGateway, intlBillingEnabled, razorpayAllowedFor } from "@/lib/subscriptions/razorpayService";

export const dynamic = "force-dynamic";

const query = z.object({ planId: z.enum(["professional", "business"]), interval: z.enum(["MONTHLY", "YEARLY"]), coupon: z.string().trim().max(40).optional() });

/** What the owner would pay now for this plan (credit for the unused part of the current plan included). Owner only. India: rupees via Cashfree. International: dollars via Razorpay. */
async function GET_handler(req: NextRequest) {
  const session = await accessSession("owner");
  if (!session?.user?.businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const q = parseQuery(req.url, query);
  if (!q.ok) return q.res;
  const b = await prisma.business.findUnique({ where: { id: session.user.businessId }, select: { currency: true } });
  if (!b) return NextResponse.json({ error: "Business not found." }, { status: 404 });
  if (billingGateway(b) === "RAZORPAY") {
    const guard = razorpayAllowedFor(b);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: 403 });
    if (!intlBillingEnabled()) return NextResponse.json({ error: "Plan payments outside India are coming soon." }, { status: 403 });
    const r = await quoteFor(session.user.businessId, q.data.planId, q.data.interval, new Date(), q.data.coupon, "RAZORPAY");
    return NextResponse.json({ kind: r.kind, currency: "USD", ...r.quote, coupon: r.coupon ? { code: r.coupon.code, name: r.coupon.name } : null, couponError: r.couponError, mandate: { needsExtraAuth: false, note: null } });
  }
  const r = await quoteFor(session.user.businessId, q.data.planId, q.data.interval, new Date(), q.data.coupon);
  return NextResponse.json({ kind: r.kind, ...r.quote, coupon: r.coupon ? { code: r.coupon.code, name: r.coupon.name } : null, couponError: r.couponError, mandate: mandateCheck(r.newAmount) });
}

export const GET = safeRoute(GET_handler);
