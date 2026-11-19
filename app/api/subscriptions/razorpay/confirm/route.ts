import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { accessSession } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { parseBody } from "@/lib/validation/common";
import { rateLimit } from "@/lib/ratelimit";
import { confirmIntlCheckout } from "@/lib/subscriptions/razorpayService";

export const dynamic = "force-dynamic";

const schema = z.object({ paymentId: z.string().max(60), razorpaySubscriptionId: z.string().max(60), signature: z.string().max(200) });

/**
 * Razorpay Checkout finished in the owner's browser. The signature (HMAC with the key secret) proves it, and the amount and status are read from
 * Razorpay, never from the browser; the plan activates now instead of waiting for the webhook. Owner only, and only their own subscription.
 */
async function POST_handler(req: NextRequest) {
  const session = await accessSession("owner");
  if (!session?.user?.businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rl = await rateLimit(`rzp-confirm:${session.user.businessId}`, 20, 60 * 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many attempts." }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.res;
  const owned = await prisma.subscription.findFirst({ where: { rzpSubscriptionId: parsed.data.razorpaySubscriptionId, businessId: session.user.businessId }, select: { id: true } });
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const r = await confirmIntlCheckout(parsed.data);
  return NextResponse.json({ state: r }, { status: r === "invalid" ? 400 : 200 });
}

export const POST = safeRoute(POST_handler);
