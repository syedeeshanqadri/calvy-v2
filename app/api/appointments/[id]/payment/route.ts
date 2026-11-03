import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { accessSession, appointmentWhere } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { notify } from "@/lib/notifications/enqueue";
import { noticeFrom, receipt } from "@/lib/notifications/events";
import { ownerAlert } from "@/lib/notifications/business";

export const dynamic = 'force-dynamic';

async function PATCH_handler(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await accessSession("appointments.write");
  if (!session?.user?.businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const appointment = await prisma.appointment.findFirst({
    where: { id: params.id, businessId: session.user.businessId, ...appointmentWhere(session.access) },
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

  // The customer gets a receipt (once per booking, whatever the clicks). A failed email never undoes the payment.
  try {
    const full = await prisma.appointment.findFirst({
      where: { id: params.id, businessId: session.user.businessId },
      include: { client: true, service: true, staff: true, business: true },
    });
    if (full) {
      const n = noticeFrom(full);
      await notify(receipt(n), await ownerAlert(n, "paid"));
    }
  } catch (err) {
    logger.error("[Payments] receipt failed:", { err });
  }

  return NextResponse.json({ appointment: updated });
}

export const PATCH = safeRoute(PATCH_handler);
