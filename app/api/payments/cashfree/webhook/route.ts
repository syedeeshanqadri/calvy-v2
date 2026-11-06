import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { parseCashfreeWebhook } from "@/lib/payments/cashfree";
import { applyPaymentEvent } from "@/lib/payments/events";
import { prismaPaymentEventStore } from "@/lib/payments/db";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { settlePaidPayment } from "@/lib/onlinePayment";

export const dynamic = "force-dynamic";

// Cashfree payment webhooks. Verifies the signature over the raw body, applies the event once, then
// settles a paid payment (confirm the held booking, or refund a lapsed hold).
async function POST_handler(req: NextRequest) {
  const secret = process.env.CASHFREE_SECRET_KEY;
  if (!secret) return NextResponse.json({ error: "Payments are not configured" }, { status: 503 });

  const rawBody = await req.text();
  const event = parseCashfreeWebhook(rawBody, req.headers, secret);
  if (!event) return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });

  // A paid event must carry the amount: without it the amount cannot be checked, so it is not applied here
  // (the customer's return page re-checks the order with Cashfree, which confirms a genuinely paid order).
  if (event.kind === "PAID" && event.amountMinor == null) {
    logger.warn("[Cashfree] paid webhook without an amount not applied", { orderId: event.providerOrderId });
    return NextResponse.json({ received: true, result: "missing_amount" });
  }

  const outcome = await applyPaymentEvent(prismaPaymentEventStore, "CASHFREE", event);
  if (outcome.result === "amount_mismatch" || outcome.result === "unknown_order") {
    logger.warn("[Cashfree] webhook not applied", { result: outcome.result, orderId: event.providerOrderId, kind: event.kind });
  }
  if (event.kind === "PAID") {
    // Also on a redelivery: settling is idempotent and finishes work a crashed attempt left undone.
    const payment = await prisma.payment.findFirst({ where: { provider: "CASHFREE", providerOrderId: event.providerOrderId, status: "PAID" }, select: { id: true } });
    if (payment) await settlePaidPayment(payment.id);
  }
  // 200 for every verified event (including duplicates) so Cashfree stops retrying.
  return NextResponse.json({ received: true, result: outcome.result });
}

export const POST = safeRoute(POST_handler);
