import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getPaymentProvider } from "@/lib/payments";
import { applyPaymentEvent } from "@/lib/payments/events";
import { prismaPaymentEventStore } from "@/lib/payments/db";
import { settlePaidPayment } from "@/lib/onlinePayment";
import { parseBody } from "@/lib/validation/common";

export const dynamic = "force-dynamic";

const body = z.object({ orderId: z.string().min(1).max(80), outcome: z.enum(["PAID", "FAILED"]) });

// Dev-only stand-in for the gateway: the mock checkout page reports pay / fail here. Disabled
// whenever a real gateway is configured and always in production.
async function POST_handler(req: NextRequest) {
  if (process.env.NODE_ENV === "production" || getPaymentProvider()?.name !== "MOCK") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const parsed = await parseBody(req, body);
  if (!parsed.ok) return parsed.res;
  const { orderId, outcome } = parsed.data;
  const payment = await prisma.payment.findFirst({ where: { provider: "MOCK", providerOrderId: orderId } });
  if (!payment) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  await applyPaymentEvent(prismaPaymentEventStore, "MOCK", {
    eventId: `mock:${orderId}:${outcome}`, kind: outcome, providerOrderId: orderId,
    amountMinor: payment.amountMinor, method: "upi", paymentRef: `mock_${orderId}`,
  });
  const settled = outcome === "PAID" ? await settlePaidPayment(payment.id) : "noop";
  return NextResponse.json({ ok: true, settled });
}

export const POST = safeRoute(POST_handler);
