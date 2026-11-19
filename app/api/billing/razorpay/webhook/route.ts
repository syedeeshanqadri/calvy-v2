import { safeRoute } from "@/lib/api";
import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { parseRazorpayEvent, razorpayConfig, verifyWebhookSignature } from "@/lib/subscriptions/razorpay";
import { handleRazorpayEvent } from "@/lib/subscriptions/razorpayService";

export const dynamic = "force-dynamic";

/**
 * Razorpay events for Calvy's own plan billing (international businesses). Public on purpose: the proof is the signature, an HMAC-SHA256 of the
 * RAW body with RAZORPAY_WEBHOOK_SECRET, checked in constant time before anything is read. Each event id is applied once (WebhookEvent); a
 * failure to apply releases the id so Razorpay's retry can succeed. A verified event always gets 200 so Razorpay stops retrying a harmless one.
 */
async function POST_handler(req: NextRequest) {
  const cfg = razorpayConfig();
  if (!cfg.ok || !cfg.config.webhookSecret) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const rawBody = await req.text();
  if (!verifyWebhookSignature(rawBody, req.headers.get("x-razorpay-signature"), cfg.config.webhookSecret)) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }
  const event = parseRazorpayEvent(rawBody);
  if (!event) return NextResponse.json({ received: true, result: "unreadable" });

  // Razorpay sends a unique event id in a header; without one, the body's hash identifies a repeat.
  const eventId = `rzp:${req.headers.get("x-razorpay-event-id")?.slice(0, 100) || createHash("sha256").update(rawBody).digest("hex")}`;
  try {
    await prisma.webhookEvent.create({ data: { provider: "RAZORPAY", eventId, kind: event.event.slice(0, 80) } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return NextResponse.json({ received: true, result: "duplicate" });
    throw e;
  }
  try {
    const result = await handleRazorpayEvent(event);
    return NextResponse.json({ received: true, result });
  } catch (err) {
    logger.error("[Razorpay] webhook handling failed", { err, event: event.event });
    await prisma.webhookEvent.deleteMany({ where: { provider: "RAZORPAY", eventId } }).catch(() => {});
    return NextResponse.json({ error: "Could not apply the event" }, { status: 500 });
  }
}

export const POST = safeRoute(POST_handler);
