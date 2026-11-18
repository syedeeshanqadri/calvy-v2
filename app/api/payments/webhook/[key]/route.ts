import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { applyPaymentEvent } from "@/lib/payments/events";
import { prismaPaymentEventStore } from "@/lib/payments/db";
import { providerForGateway } from "@/lib/payments/gateways";
import { settlePaidPayment } from "@/lib/onlinePayment";

export const dynamic = "force-dynamic";

// One webhook URL per business gateway (random key in the path). The signature is verified on the RAW body with THAT gateway's
// own secret, the event only touches that gateway's payments, and a redelivered event is applied once (WebhookEvent).
type Ctx = { params: Promise<{ key: string }> };

async function POST_handler(req: NextRequest, { params }: Ctx) {
  const { key } = await params;
  const gateway = key && key.length >= 20 ? await prisma.paymentGateway.findUnique({ where: { webhookKey: key } }) : null;
  if (!gateway) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rawBody = await req.text();
  let provider;
  try { provider = providerForGateway(gateway); } catch { return NextResponse.json({ error: "Gateway not configured" }, { status: 503 }); }
  const event = await provider.verifyWebhook(rawBody, req.headers);
  if (!event) return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });

  if (event.kind === "PAID" && event.amountMinor == null) {
    // Without the amount it cannot be checked: the customer's return page re-checks the order with the gateway instead.
    logger.warn("[Gateway] paid webhook without an amount not applied", { gatewayId: gateway.id });
    return NextResponse.json({ received: true, result: "missing_amount" });
  }
  const outcome = await applyPaymentEvent(prismaPaymentEventStore, provider.name, event, { gatewayId: gateway.id });
  if (outcome.result === "amount_mismatch" || outcome.result === "unknown_order") {
    logger.warn("[Gateway] webhook not applied", { result: outcome.result, gatewayId: gateway.id, kind: event.kind });
  }
  if (event.kind === "PAID") {
    const payment = await prisma.payment.findFirst({ where: { gatewayId: gateway.id, providerOrderId: event.providerOrderId, status: "PAID" }, select: { id: true } });
    if (payment) await settlePaidPayment(payment.id);
  }
  // 200 for every verified event (including duplicates) so the gateway stops retrying.
  return NextResponse.json({ received: true, result: outcome.result });
}

export const POST = safeRoute(POST_handler);
