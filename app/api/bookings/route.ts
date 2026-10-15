import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { razorpay } from "@/lib/razorpay";
import { sendBookingConfirmation } from "@/lib/email";
import { sendBookingConfirmationWhatsApp } from "@/lib/whatsapp";
import { sendPushToBusiness } from "@/lib/push";
import { DEFAULT_CURRENCY } from "@/lib/currency";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { findClientByEmail } from "@/lib/email-normalize";
import { parseBody } from "@/lib/validation/common";
import { bookingSchema } from "@/lib/validation/bookings";
import { isPastBooking, hasBookingConflict } from "@/lib/booking";

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const rl = await rateLimit(`booking:${clientIp(req)}`, 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many booking attempts. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  const parsed = await parseBody(req, bookingSchema);
  if (!parsed.ok) return parsed.res;
  const { businessSlug, staffId, date, time, clientName, clientEmail, clientPhone, notes } = parsed.data;

  // Support serviceIds[] (multi-service) and legacy serviceId (single)
  const serviceIds: string[] = parsed.data.serviceIds?.length ? parsed.data.serviceIds : [parsed.data.serviceId!];

  const business = await prisma.business.findUnique({
    where: { slug: businessSlug },
    include: { services: true },
  });
  if (!business) return NextResponse.json({ error: "Business not found." }, { status: 404 });

  // Tenant isolation: a staff member must belong to this business.
  if (staffId) {
    const staffOk = await prisma.staff.findFirst({ where: { id: staffId, businessId: business.id }, select: { id: true } });
    if (!staffOk) return NextResponse.json({ error: "Staff member not found." }, { status: 404 });
  }

  const servicesMap = new Map(business.services.map(s => [s.id, s]));
  const orderedServices = serviceIds.map(id => servicesMap.get(id)).filter(Boolean) as typeof business.services;
  if (orderedServices.length !== new Set(serviceIds).size) return NextResponse.json({ error: "Services not found." }, { status: 404 });

  const totalPrice = orderedServices.reduce((sum, s) => sum + s.price, 0);
  const totalDuration = orderedServices.reduce((sum, s) => sum + s.duration, 0);
  const serviceNamesLabel = orderedServices.map(s => s.name).join(" & ");

  // Server-side slot validation. The availability endpoint is advisory only,
  // so we re-check here authoritatively to prevent past-dated and
  // double-booked appointments (direct API calls or client races).
  const appointmentStart = new Date(`${date}T${time}:00`);
  if (isNaN(appointmentStart.getTime())) {
    return NextResponse.json({ error: "Invalid date or time." }, { status: 400 });
  }
  if (isPastBooking(appointmentStart.getTime())) {
    return NextResponse.json({ error: "That time has already passed. Please pick a future slot." }, { status: 400 });
  }

  // Conflict check — mirrors the availability endpoint (business-wide, capacity-aware).
  const capacity = Math.max(1, orderedServices[0].capacity ?? 1);
  const newStart = appointmentStart.getTime();
  const dayStart = new Date(appointmentStart); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(appointmentStart); dayEnd.setHours(23, 59, 59, 999);
  const sameDay = await prisma.appointment.findMany({
    where: {
      businessId: business.id,
      status: { notIn: ["cancelled", "no-show"] },
      date: { gte: dayStart, lte: dayEnd },
    },
    select: { date: true, duration: true },
  });
  const conflict = hasBookingConflict({
    start: newStart,
    durationMin: totalDuration,
    capacity,
    existing: sameDay.map(a => ({ start: a.date.getTime(), durationMin: a.duration })),
  });
  if (conflict) {
    const msg = capacity > 1
      ? "This time slot is fully booked. Please choose another."
      : "This time slot is no longer available. Please choose another.";
    return NextResponse.json({ error: msg }, { status: 409 });
  }

  const paymentMode = (business as { paymentMode?: string }).paymentMode ?? "postpaid";

  // Extra service names (beyond the first) are stored as "__services__:Name2|Name3" prefix in notes
  const combinedNotes = (() => {
    const prefix =
      orderedServices.length > 1
        ? `__services__:${orderedServices
            .slice(1)
            .map(s => s.name)
            .join("|")}`
        : "";
    if (prefix && notes) return `${prefix}\n${notes}`;
    if (prefix) return prefix;
    return notes || null;
  })();

  async function createAppointment(
    clientId: string,
    baseDate: Date,
    paymentStatus: string,
    paymentModeVal: string,
    razorpayPaymentId?: string,
  ) {
    return prisma.appointment.create({
      data: {
        businessId: business!.id,
        clientId,
        staffId: staffId || null,
        serviceId: orderedServices[0].id,
        date: baseDate,
        duration: totalDuration,
        price: totalPrice,
        status: "confirmed",
        notes: combinedNotes,
        paymentStatus,
        paymentMode: paymentModeVal,
        ...(razorpayPaymentId ? { razorpayPaymentId } : {}),
      },
    });
  }

  // Postpaid path — create appointments directly, client pays at visit
  if (paymentMode === "postpaid") {
    let client = await findClientByEmail(prisma, business.id, clientEmail);
    if (!client) {
      client = await prisma.client.create({
        data: { businessId: business.id, name: clientName, email: clientEmail, phone: clientPhone || null },
      });
    }

    const appointmentDate = new Date(`${date}T${time}:00`);
    const appointment = await createAppointment(client.id, appointmentDate, "unpaid", "postpaid");

    await prisma.client.update({
      where: { id: client.id },
      data: { totalAppointments: { increment: 1 }, lastVisit: appointmentDate },
    });

    const dateLabel = appointmentDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    const staffMember = staffId
      ? await prisma.staff.findFirst({ where: { id: staffId, businessId: business.id }, select: { name: true } })
      : null;

    sendPushToBusiness(business.id, {
      title: "New booking received",
      body: `${clientName} — ${serviceNamesLabel} on ${dateLabel} at ${time}`,
      url: "/dashboard/appointments",
      tag: "new-booking",
    }).catch(() => {});

    try {
      await sendBookingConfirmation({
        to: clientEmail,
        clientName,
        businessName: business.name,
        serviceName: serviceNamesLabel,
        staffName: staffMember?.name ?? "Your provider",
        date: dateLabel,
        time,
        duration: totalDuration,
        price: totalPrice,
        currency: business.currency ?? DEFAULT_CURRENCY,
        appointmentDate,
        ctx: { appointmentId: appointment.id, businessId: business.id },
      });
    } catch (err) {
      console.error("[Email] Failed:", err);
    }

    if (clientPhone) {
      try {
        await sendBookingConfirmationWhatsApp({
          to: clientPhone,
          clientName,
          serviceName: serviceNamesLabel,
          businessName: business.name,
          date: dateLabel,
          time,
        });
      } catch (err) {
        console.error("[WhatsApp] Failed:", err);
      }
    }

    return NextResponse.json({ success: true, appointmentId: appointment.id, paymentMode: "postpaid" });
  }

  // Prepaid path — redirect to Razorpay Payment Link
  const razorpayKey = process.env.RAZORPAY_KEY_ID;

  // Fail closed in production: never create an unpaid appointment for a prepaid
  // business just because Razorpay isn't configured. The free "demo" path below
  // is only acceptable in non-production environments.
  if (!razorpayKey && process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Online payments are temporarily unavailable. Please try again later." },
      { status: 503 },
    );
  }

  if (razorpayKey) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
    const currency = (business.currency ?? DEFAULT_CURRENCY).toUpperCase();

    const paymentLink = await (razorpay.paymentLink.create as any)({
      amount: Math.round(totalPrice * 100),
      currency,
      description: `${serviceNamesLabel} · ${business.name}`,
      customer: {
        name: clientName,
        email: clientEmail,
        contact: clientPhone ?? "",
      },
      notify: { sms: false, email: false },
      callback_url: `${appUrl}/booking/success`,
      callback_method: "get",
      notes: {
        businessSlug,
        serviceIds: JSON.stringify(serviceIds),
        staffId: staffId ?? "",
        date,
        time,
        clientName,
        clientEmail,
        clientPhone: clientPhone ?? "",
        notes: notes ?? "",
      },
    });

    return NextResponse.json({ url: paymentLink.short_url });
  }

  // Dev/demo mode — create appointments without payment
  let client = await findClientByEmail(prisma, business.id, clientEmail);
  if (!client) {
    client = await prisma.client.create({
      data: { businessId: business.id, name: clientName, email: clientEmail, phone: clientPhone || null },
    });
  }

  const appointmentDate = new Date(`${date}T${time}:00`);
  const appointment = await createAppointment(client.id, appointmentDate, "unpaid", "prepaid");

  await prisma.client.update({
    where: { id: client.id },
    data: {
      totalAppointments: { increment: 1 },
      totalSpent: { increment: totalPrice },
      lastVisit: appointmentDate,
    },
  });

  const dateLabel = appointmentDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const staffMember = staffId
    ? await prisma.staff.findFirst({ where: { id: staffId, businessId: business.id }, select: { name: true } })
    : null;

  sendPushToBusiness(business.id, {
    title: "New booking received",
    body: `${clientName} — ${serviceNamesLabel} on ${dateLabel} at ${time}`,
    url: "/dashboard/appointments",
    tag: "new-booking",
  }).catch(() => {});

  try {
    await sendBookingConfirmation({
      to: clientEmail,
      clientName,
      businessName: business.name,
      serviceName: serviceNamesLabel,
      staffName: staffMember?.name ?? "Your provider",
      date: dateLabel,
      time,
      duration: totalDuration,
      price: totalPrice,
      currency: business.currency ?? DEFAULT_CURRENCY,
      appointmentDate,
      ctx: { appointmentId: appointment.id, businessId: business.id },
    });
  } catch (err) {
    console.error("[Email] Failed:", err);
  }

  if (clientPhone) {
    try {
      await sendBookingConfirmationWhatsApp({
        to: clientPhone,
        clientName,
        serviceName: serviceNamesLabel,
        businessName: business.name,
        date: dateLabel,
        time,
      });
    } catch (err) {
      console.error("[WhatsApp] Failed:", err);
    }
  }

  return NextResponse.json({ success: true, appointmentId: appointment.id });
}
