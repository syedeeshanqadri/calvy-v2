import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { notify } from "@/lib/notifications/enqueue";
import { receiptNotification } from "@/lib/notifications/receipt";

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const appointment = await prisma.appointment.findFirst({
    where: { id: params.id, businessId: session.user.businessId },
    select: { id: true, businessId: true, clientId: true, price: true, paymentStatus: true, paymentMode: true },
  });

  if (!appointment) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (appointment.paymentStatus === "paid") return NextResponse.json({ error: "Already marked as paid" }, { status: 400 });

  const [updated] = await prisma.$transaction([
    prisma.appointment.update({
      where: { id: params.id },
      data: { paymentStatus: "paid" },
    }),
    prisma.client.update({
      where: { id: appointment.clientId },
      data: { totalSpent: { increment: appointment.price } },
    }),
  ]);

  // The customer gets a receipt. A failed email never undoes the payment.
  try {
    const full = await prisma.appointment.findFirst({
      where: { id: params.id, businessId: session.user.businessId },
      include: { client: true, service: true, staff: true, business: true },
    });
    const receipt = full && receiptNotification(full);
    if (receipt) await notify(receipt);
  } catch (err) {
    logger.error("[Payments] receipt failed:", { err });
  }

  return NextResponse.json({ appointment: updated });
}
