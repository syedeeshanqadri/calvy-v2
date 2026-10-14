import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { razorpay } from "@/lib/razorpay";

export const dynamic = 'force-dynamic';

// Cancel subscription at end of current billing cycle
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const business = await prisma.business.findUnique({
    where: { id: session.user.businessId },
    select: { razorpaySubscriptionId: true },
  });

  if (!business?.razorpaySubscriptionId) {
    return NextResponse.json({ error: "No active subscription found" }, { status: 404 });
  }

  try {
    await (razorpay.subscriptions.cancel as any)(business.razorpaySubscriptionId, { cancel_at_cycle_end: 1 });
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Razorpay error";
    console.error("Cancel subscription error:", message);
    return NextResponse.json({ error: `Failed to cancel subscription: ${message}` }, { status: 500 });
  }
}
