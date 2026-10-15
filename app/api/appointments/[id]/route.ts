import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseBody } from "@/lib/validation/common";
import { appointmentPatchSchema } from "@/lib/validation/appointments";
import { sendBookingCancellation, sendBookingReschedule, sendInvoice, type BookingDetails } from "@/lib/email";
import { logger } from "@/lib/logger";

export const dynamic = 'force-dynamic';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://calvy.io";
const fmtDate = (d: Date) => d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
const fmtTime = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const appointment = await prisma.appointment.findFirst({
    where: { id: params.id, businessId: session.user.businessId },
  });
  if (!appointment) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }

  const parsed = await parseBody(req, appointmentPatchSchema);
  if (!parsed.ok) return parsed.res;
  const { status, paymentStatus, paymentMode, date } = parsed.data;

  // Reschedule support
  let newDate: Date | undefined;
  if (date !== undefined) {
    const d = new Date(date);
    if (isNaN(d.getTime())) return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    if (d.getTime() !== appointment.date.getTime()) newDate = d;
  }

  // Detect transitions (before applying the update)
  const willCancel = status === "cancelled" && appointment.status !== "cancelled";
  const willPay = paymentStatus === "paid" && appointment.paymentStatus !== "paid";
  const willReschedule = !!newDate && !willCancel;

  const updated = await prisma.appointment.update({
    where: { id: params.id },
    data: {
      ...(status && { status }),
      ...(paymentStatus && { paymentStatus }),
      ...(paymentMode && { paymentMode }),
      ...(newDate && { date: newDate }),
    },
  });

  // Fire the matching transactional emails (awaited so delivery is logged before we respond)
  if (willCancel || willReschedule || willPay) {
    try {
      const full = await prisma.appointment.findFirst({
        where: { id: params.id, businessId: session.user.businessId },
        include: { client: true, service: true, staff: true, business: true },
      });
      if (full?.client?.email) {
        const base: BookingDetails = {
          to: full.client.email,
          clientName: full.client.name,
          businessName: full.business.name,
          serviceName: full.service.name,
          staffName: full.staff?.name ?? "Your provider",
          date: fmtDate(full.date),
          time: fmtTime(full.date),
          duration: full.duration,
          price: full.price,
          currency: full.business.currency ?? "INR",
          ctx: { appointmentId: full.id, businessId: full.businessId },
        };

        if (willCancel) {
          await sendBookingCancellation({ ...base, rebookUrl: `${APP_URL}/${full.business.slug}` });
        } else if (willReschedule) {
          await sendBookingReschedule({ ...base, oldDate: fmtDate(appointment.date), oldTime: fmtTime(appointment.date) });
        }
        if (willPay && !willCancel) {
          await sendInvoice({
            ...base,
            invoiceNumber: `INV-${full.id.slice(-8).toUpperCase()}`,
            clientEmail: full.client.email,
            paymentRef: full.razorpayPaymentId ?? undefined,
          });
        }
      }
    } catch (err) {
      logger.error("[Appointments] transactional email error:", { err });
    }
  }

  return NextResponse.json({ appointment: updated });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const appointment = await prisma.appointment.findFirst({
    where: { id: params.id, businessId: session.user.businessId },
  });
  if (!appointment) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }

  await prisma.appointment.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
