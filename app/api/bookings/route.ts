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
import { isPastBooking, bookExclusive, SlotConflictError, conflictMessage } from "@/lib/booking";
import { zonedTimeToUtc, formatDateLabel } from "@/lib/time";
import { logger } from "@/lib/logger";

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
  // so we re-check here authoritatively. Wall-clock input is read in the
  // business's own timezone and stored as a UTC instant.
  const tz = business.timezone;
  const appointmentStart = zonedTimeToUtc(date, time, tz);
  if (isNaN(appointmentStart.getTime())) {
    return NextResponse.json({ error: "Invalid date or time." }, { status: 400 });
  }
  if (isPastBooking(appointmentStart.getTime())) {
    return NextResponse.json({ error: "That time has already passed. Please pick a future slot." }, { status: 400 });
  }

  const capacity = Math.max(1, orderedServices[0].capacity ?? 1);
  const slot = { businessId: business.id, start: appointmentStart, durationMin: totalDuration, capacity };

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

  // Conflict check + insert run in one transaction under an advisory lock, so
  // two requests for the same slot can never both succeed.
  function createAppointment(
    clientId: string,
    paymentStatus: string,
    paymentModeVal: string,
  ) {
    return bookExclusive(prisma, slot, (tx) =>
      tx.appointment.create({
        data: {
          businessId: business!.id,
          clientId,
          staffId: staffId || null,
          serviceId: orderedServices[0].id,
          date: appointmentStart,
          endAt: new Date(appointmentStart.getTime() + totalDuration * 60_000),
          duration: totalDuration,
          price: totalPrice,
          status: "confirmed",
          notes: combinedNotes,
          paymentStatus,
          paymentMode: paymentModeVal,
        },
      }),
    );
  }

  // Post-commit work shared by the postpaid and demo paths.
  async function notify(appointmentId: string, spent: number) {
    await prisma.client.update({
      where: { id: client.id },
      data: {
        totalAppointments: { increment: 1 },
        ...(spent ? { totalSpent: { increment: spent } } : {}),
        lastVisit: appointmentStart,
      },
    });

    const dateLabel = formatDateLabel(appointmentStart, tz);
    const staffMember = staffId
      ? await prisma.staff.findFirst({ where: { id: staffId, businessId: business!.id }, select: { name: true } })
      : null;

    sendPushToBusiness(business!.id, {
      title: "New booking received",
      body: `${clientName} — ${serviceNamesLabel} on ${dateLabel} at ${time}`,
      url: "/dashboard/appointments",
      tag: "new-booking",
    }).catch(() => {});

    try {
      await sendBookingConfirmation({
        to: clientEmail,
        clientName,
        businessName: business!.name,
        serviceName: serviceNamesLabel,
        staffName: staffMember?.name ?? "Your provider",
        date: dateLabel,
        time,
        duration: totalDuration,
        price: totalPrice,
        currency: business!.currency ?? DEFAULT_CURRENCY,
        appointmentDate: appointmentStart,
        ctx: { appointmentId, businessId: business!.id },
      });
    } catch (err) {
      logger.error("[Email] Failed:", { err });
    }

    if (clientPhone) {
      try {
        await sendBookingConfirmationWhatsApp({
          to: clientPhone,
          clientName,
          serviceName: serviceNamesLabel,
          businessName: business!.name,
          date: dateLabel,
          time,
        });
      } catch (err) {
        logger.error("[WhatsApp] Failed:", { err });
      }
    }
  }

  async function getOrCreateClient() {
    const existing = await findClientByEmail(prisma, business!.id, clientEmail);
    if (existing) return existing;
    return prisma.client.create({
      data: { businessId: business!.id, name: clientName, email: clientEmail, phone: clientPhone || null },
    });
  }

  const conflictResponse = () =>
    NextResponse.json({ error: conflictMessage(capacity) }, { status: 409 });

  let client: Awaited<ReturnType<typeof getOrCreateClient>>;

  // Postpaid path — create appointments directly, client pays at visit
  if (paymentMode === "postpaid") {
    client = await getOrCreateClient();
    let appointment;
    try {
      appointment = await createAppointment(client.id, "unpaid", "postpaid");
    } catch (err) {
      if (err instanceof SlotConflictError) return conflictResponse();
      throw err;
    }
    await notify(appointment.id, 0);
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
    // Early, non-binding check: the slot is re-checked when the paid booking is stored.
    try {
      await bookExclusive(prisma, slot, async () => null);
    } catch (err) {
      if (err instanceof SlotConflictError) return conflictResponse();
      throw err;
    }
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
  client = await getOrCreateClient();
  let appointment;
  try {
    appointment = await createAppointment(client.id, "unpaid", "prepaid");
  } catch (err) {
    if (err instanceof SlotConflictError) return conflictResponse();
    throw err;
  }
  await notify(appointment.id, totalPrice);
  return NextResponse.json({ success: true, appointmentId: appointment.id });
}
