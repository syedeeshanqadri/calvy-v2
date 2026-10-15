import { zonedTimeToUtc, safeTimeZone } from "@/lib/time";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { razorpay } from "@/lib/razorpay";

export const dynamic = 'force-dynamic';

// Called from /booking/success as a fallback to verify a Razorpay payment link payment
// and create the appointment if the webhook hasn't fired yet.
export async function POST(req: NextRequest) {
  const { paymentLinkId } = await req.json();
  if (!paymentLinkId) return NextResponse.json({ error: "Missing paymentLinkId" }, { status: 400 });

  const link = await (razorpay.paymentLink.fetch as any)(paymentLinkId) as any;
  if (link.status !== "paid") {
    return NextResponse.json({ error: "Payment not completed" }, { status: 402 });
  }

  const meta: Record<string, string> = link.notes ?? {};
  if (!meta.businessSlug || !meta.clientEmail) {
    return NextResponse.json({ error: "Invalid payment link metadata" }, { status: 400 });
  }

  // Idempotency — already created by webhook
  const existing = await prisma.appointment.findFirst({ where: { razorpayPaymentId: paymentLinkId } });
  if (existing) return NextResponse.json({ appointmentId: existing.id, already: true });

  const business = await prisma.business.findUnique({ where: { slug: meta.businessSlug } });
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  let serviceIds: string[];
  if (meta.serviceIds) {
    try { serviceIds = JSON.parse(meta.serviceIds); } catch { serviceIds = [meta.serviceIds]; }
  } else if (meta.serviceId) {
    serviceIds = [meta.serviceId];
  } else {
    return NextResponse.json({ error: "No services in payment link" }, { status: 400 });
  }

  const services = await prisma.service.findMany({ where: { id: { in: serviceIds } } });
  if (services.length === 0) return NextResponse.json({ error: "Services not found" }, { status: 404 });

  const servicesMap = new Map(services.map(s => [s.id, s]));
  const orderedServices = serviceIds.map(id => servicesMap.get(id)).filter(Boolean) as typeof services;

  const totalPrice = orderedServices.reduce((sum, s) => sum + s.price, 0);
  const totalDuration = orderedServices.reduce((sum, s) => sum + s.duration, 0);

  const combinedNotes = (() => {
    const prefix =
      orderedServices.length > 1
        ? `__services__:${orderedServices.slice(1).map(s => s.name).join("|")}`
        : "";
    if (prefix && meta.notes) return `${prefix}\n${meta.notes}`;
    if (prefix) return prefix;
    return meta.notes || null;
  })();

  let client = await prisma.client.findUnique({
    where: { businessId_email: { businessId: business.id, email: meta.clientEmail } },
  });
  if (!client) {
    client = await prisma.client.create({
      data: {
        businessId: business.id,
        name: meta.clientName,
        email: meta.clientEmail,
        phone: meta.clientPhone || null,
      },
    });
  }

  const appointmentDate = zonedTimeToUtc(meta.date, meta.time, safeTimeZone(business.timezone));

  const appointment = await prisma.appointment.create({
    data: {
      businessId: business.id,
      clientId: client.id,
      staffId: meta.staffId || null,
      serviceId: orderedServices[0].id,
      date: appointmentDate,
      endAt: new Date(appointmentDate.getTime() + totalDuration * 60_000),
      duration: totalDuration,
      price: totalPrice,
      status: "confirmed",
      notes: combinedNotes,
      razorpayPaymentId: paymentLinkId,
      paymentStatus: "paid",
      paymentMode: "prepaid",
    },
  });

  await prisma.client.update({
    where: { id: client.id },
    data: {
      totalAppointments: { increment: 1 },
      totalSpent: { increment: totalPrice },
      lastVisit: appointmentDate,
    },
  });

  return NextResponse.json({ appointmentId: appointment.id });
}
