import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { accessSession } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { parseBody } from "@/lib/validation/common";
import { audit } from "@/lib/audit";
import { refundPayment } from "@/lib/onlinePayment";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({ manual: z.boolean().optional() });

/**
 * Refund a service payment the business took through its OWN gateway. Owner only. Calls the gateway's refund API; with
 * { manual: true } it only records that the owner already refunded the customer themselves. The Rs 10 confirmation fee is
 * Calvy's and is never refunded here.
 */
async function POST_handler(req: NextRequest, { params }: Ctx) {
  const session = await accessSession("owner");
  if (!session?.user?.businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const businessId = session.user.businessId;
  const { id } = await params;
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.res;

  const payment = await prisma.payment.findFirst({ where: { id, businessId } });
  if (!payment) return NextResponse.json({ error: "Payment not found." }, { status: 404 });
  if (!payment.gatewayId) return NextResponse.json({ error: "This is Calvy's confirmation fee. It is kept when a booking is cancelled or not attended, and is not refunded from here." }, { status: 409 });
  if (payment.status !== "PAID") return NextResponse.json({ error: payment.status === "REFUNDED" ? "Already refunded." : "Only a paid payment can be refunded." }, { status: 409 });

  if (parsed.data.manual) {
    // Claimed conditionally so a double click records it once.
    const claimed = await prisma.payment.updateMany({ where: { id, businessId, status: "PAID" }, data: { status: "REFUNDED", refundedMinor: payment.amountMinor } });
    if (claimed.count !== 1) return NextResponse.json({ error: "Already refunded." }, { status: 409 });
  } else {
    const ok = await refundPayment(id, payment.amountMinor, "Refunded by the business");
    if (!ok) return NextResponse.json({ error: "Your payment gateway could not refund this payment. Check it in the gateway's dashboard." }, { status: 502 });
  }
  if (payment.appointmentId) await prisma.appointment.updateMany({ where: { id: payment.appointmentId, businessId }, data: { paymentStatus: "refunded" } });
  await audit({ businessId, actorId: session.user.id ?? "owner", action: "payment.refunded", target: id, detail: { manual: !!parsed.data.manual, amountMinor: payment.amountMinor } });
  return NextResponse.json({ ok: true });
}

export const POST = safeRoute(POST_handler);
