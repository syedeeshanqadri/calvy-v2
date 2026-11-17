import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { parseSubsWebhook, webhookSecrets } from "@/lib/subscriptions/cashfree";
import { onAuthFailed, onAuthorised, onChargeFailed, onChargeSucceeded, onMandateEnded } from "@/lib/subscriptions/service";

export const dynamic = "force-dynamic";

// Calvy's own plan-billing webhooks (Cashfree Subscriptions). The signature is verified on the RAW body, the timestamp must be recent,
// and each event is applied once (WebhookEvent). 200 for every verified event so Cashfree stops retrying.
async function POST_handler(req: NextRequest) {
  const secrets = webhookSecrets();
  if (!secrets.length) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const rawBody = await req.text();
  const event = parseSubsWebhook(rawBody, req.headers, secrets);
  if (!event) return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });

  try {
    await prisma.webhookEvent.create({ data: { provider: "CASHFREE", eventId: `subs:${event.eventId}`, kind: event.kind } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return NextResponse.json({ received: true, result: "duplicate" });
    throw e;
  }

  let result = "ignored";
  switch (event.kind) {
    case "AUTH_SUCCESS": result = await onAuthorised(event.subscriptionId, { method: event.method }); break;
    case "AUTH_FAILED": await onAuthFailed(event.subscriptionId); result = "auth_failed"; break;
    case "PAYMENT_SUCCESS":
      // An authorisation payment is reported as a normal payment too: the pending subscription activates through onAuthorised.
      result = event.paymentId ? await onChargeSucceeded(event.subscriptionId, { paymentId: event.paymentId, amountMinor: event.amountMinor, method: event.method }) : "no_payment_id";
      if (result === "noop") { const a = await onAuthorised(event.subscriptionId, { method: event.method }); if (a !== "noop") result = a; }
      break;
    case "PAYMENT_FAILED": result = await onChargeFailed(event.subscriptionId); break;
    case "ENDED": await onMandateEnded(event.subscriptionId); result = "ended"; break;
    default: logger.info("[Subscriptions] webhook ignored", { kind: event.kind, status: event.status });
  }
  return NextResponse.json({ received: true, result });
}

export const POST = safeRoute(POST_handler);
