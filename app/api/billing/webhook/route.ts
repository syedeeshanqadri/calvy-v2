import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { hmacSha256Matches } from "@/lib/hmac";

export const dynamic = 'force-dynamic';

function verifySignature(rawBody: string, signature: string, secret: string): boolean {
  return hmacSha256Matches(rawBody, signature, secret); // constant time
}

function getSubscriptionEntity(payload: any) {
  return payload?.subscription?.entity ?? null;
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const sig = request.headers.get("x-razorpay-signature");
  const secret = process.env.RAZORPAY_BILLING_WEBHOOK_SECRET;

  if (!secret || !sig) {
    return NextResponse.json({ error: "Missing webhook secret or signature" }, { status: 400 });
  }

  if (!verifySignature(body, sig, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event: { event: string; payload: Record<string, unknown> };
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    switch (event.event) {
      case "subscription.activated":
      case "subscription.charged": {
        const sub = getSubscriptionEntity(event.payload);
        if (!sub) break;
        const businessId = sub.notes?.businessId;
        const plan = sub.notes?.plan ?? "starter";
        if (!businessId) break;
        await prisma.business.update({
          where: { id: businessId },
          data: {
            plan,
            planStatus: "active",
            razorpaySubscriptionId: sub.id,
          },
        });
        break;
      }

      case "subscription.halted": {
        const sub = getSubscriptionEntity(event.payload);
        if (!sub) break;
        const businessId = sub.notes?.businessId;
        if (!businessId) break;
        await prisma.business.update({
          where: { id: businessId },
          data: { planStatus: "past_due" },
        });
        break;
      }

      case "subscription.cancelled":
      case "subscription.completed":
      case "subscription.expired": {
        const sub = getSubscriptionEntity(event.payload);
        if (!sub) break;
        const businessId = sub.notes?.businessId;
        if (!businessId) break;
        await prisma.business.update({
          where: { id: businessId },
          data: { plan: "free", planStatus: "free", razorpaySubscriptionId: null },
        });
        break;
      }
    }
  } catch (err) {
    console.error("Billing webhook error:", err);
    return NextResponse.json({ error: "Webhook processing error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
