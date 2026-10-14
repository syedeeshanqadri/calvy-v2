import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { razorpay } from "@/lib/razorpay";
import { getRazorpayPlanId, type PlanId } from "@/lib/plans";

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { plan, interval = "monthly" } = await request.json() as { plan: PlanId; interval?: "monthly" | "annual" };
  if (!["starter", "professional", "business"].includes(plan)) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  let planId = getRazorpayPlanId(plan, interval);
  if (!planId && interval === "annual") {
    planId = getRazorpayPlanId(plan, "monthly");
  }
  if (!planId) {
    return NextResponse.json({
      error: "Razorpay plan IDs not configured. Add RAZORPAY_PLAN_* to your environment variables.",
    }, { status: 503 });
  }

  const business = await prisma.business.findUnique({
    where: { id: session.user.businessId },
    select: { id: true, name: true, email: true, razorpaySubscriptionId: true },
  });
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  try {
    // If the tenant already has a subscription (plan change), cancel it first
    // so they aren't billed on both. Non-fatal if it's already gone.
    if (business.razorpaySubscriptionId) {
      try {
        await (razorpay.subscriptions.cancel as any)(business.razorpaySubscriptionId, { cancel_at_cycle_end: 0 });
      } catch (err) {
        console.error("Failed to cancel previous subscription:", err);
      }
    }

    const subscription = await (razorpay.subscriptions.create as any)({
      plan_id: planId,
      total_count: 120,
      quantity: 1,
      customer_notify: 1,
      notes: { businessId: business.id, plan },
    });

    // Persist the subscription id immediately so Sync/Cancel work even if the
    // activation webhook is missed. The plan is NOT marked active here — that
    // only happens once payment is confirmed (webhook or sync).
    await prisma.business.update({
      where: { id: business.id },
      data: { razorpaySubscriptionId: subscription.id },
    });

    return NextResponse.json({ url: subscription.short_url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Razorpay error";
    console.error("Billing upgrade error:", message);
    return NextResponse.json({ error: `Payment setup failed: ${message}` }, { status: 500 });
  }
}
