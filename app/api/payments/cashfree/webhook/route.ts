import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { parseCashfreeWebhook } from "@/lib/payments/cashfree";
import { applyPaymentEvent } from "@/lib/payments/events";
import { prismaPaymentEventStore } from "@/lib/payments/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// Cashfree payment webhooks. Verifies the signature over the raw body, then applies the event once.
// Confirming the booking on PAID is added with checkout (step-5 chunk 10); this only tracks Payment.status.
async function POST_handler(req: NextRequest) {
  const secret = process.env.CASHFREE_SECRET_KEY;
  if (!secret) return NextResponse.json({ error: "Payments are not configured" }, { status: 503 });

  const rawBody = await req.text();
  const event = parseCashfreeWebhook(rawBody, req.headers, secret);
  if (!event) return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });

  const outcome = await applyPaymentEvent(prismaPaymentEventStore, "CASHFREE", event);
  if (outcome.result === "amount_mismatch" || outcome.result === "unknown_order") {
    logger.warn("[Cashfree] webhook not applied", { result: outcome.result, orderId: event.providerOrderId, kind: event.kind });
  }
  // 200 for every verified event (including duplicates) so Cashfree stops retrying.
  return NextResponse.json({ received: true, result: outcome.result });
}

export const POST = safeRoute(POST_handler);
