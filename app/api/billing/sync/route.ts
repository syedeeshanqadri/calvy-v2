import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { razorpay } from "@/lib/razorpay";

export const dynamic = 'force-dynamic';

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
    return NextResponse.json({ error: "No Razorpay subscription found" }, { status: 404 });
  }

  try {
    const sub = await (razorpay.subscriptions.fetch as any)(business.razorpaySubscriptionId) as any;
    const subPlan = sub.notes?.plan ?? "starter";
    const status: string = sub.status;

    // Only an active/authenticated (paid) subscription grants the plan.
    // "created" means the customer hasn't paid yet — it must NOT activate, or
    // an abandoned checkout would upgrade for free.
    const ACTIVE = ["active", "authenticated"];
    const PAST_DUE = ["halted", "paused", "pending"];
    const ENDED = ["cancelled", "completed", "expired"];

    let plan = "free";
    let planStatus = "free";
    let keepSubscription = true;

    if (ACTIVE.includes(status)) {
      plan = subPlan;
      planStatus = "active";
    } else if (PAST_DUE.includes(status)) {
      plan = subPlan;
      planStatus = "past_due";
    } else if (ENDED.includes(status)) {
      keepSubscription = false; // clear it so cancel/portal stop referencing a dead sub
    }
    // "created"/unknown → free, but keep the id so the customer can still complete payment.

    await prisma.business.update({
      where: { id: session.user.businessId },
      data: {
        plan,
        planStatus,
        razorpaySubscriptionId: keepSubscription ? sub.id : null,
      },
    });

    return NextResponse.json({ plan, planStatus });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Razorpay error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
