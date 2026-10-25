import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { razorpay } from "@/lib/razorpay";
import { sendBookingConfirmation } from "@/lib/email";
import { t } from "@/lib/terms";
import { sendBookingConfirmationWhatsApp } from "@/lib/whatsapp";
import { sendPushToBusiness } from "@/lib/push";
import { DEFAULT_CURRENCY } from "@/lib/currency";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { findOrCreateClient } from "@/lib/clients";
import { parseBody } from "@/lib/validation/common";
import { bookingSchema } from "@/lib/validation/bookings";
import { isPastBooking, bookExclusive, SlotConflictError, conflictMessage } from "@/lib/booking";
import { loadAvailability } from "@/lib/availability";
import { getEffectiveLimits } from "@/lib/getFeatures";
import { checkLimit, startOfBusinessMonth, assertMonthlyHeadroom, LimitReachedError } from "@/lib/limits";
import { zonedTimeToUtc, formatDateLabel, safeTimeZone } from "@/lib/time";
import { logger } from "@/lib/logger";
import { bookToken } from "@/lib/tokenBooking";
import { missingContact } from "@/lib/patients";
import { assertNoDuplicatePatient, DuplicatePatientError } from "@/lib/patientsDb";
import { isFeatureEnabled } from "@/lib/flags";
import { PENDING_PAYMENT, holdExpiry } from "@/lib/holds";
import { chargeFor, getPayConfig, startCheckout } from "@/lib/onlinePayment";

export const dynamic = 'force-dynamic';

/** In-app notice to the owner that online booking is paused, at most once a day. */
async function notifyLimitReached(businessId: string, limit: number) {
  const title = "Online booking paused: monthly limit reached";
  const recent = await prisma.notification.findFirst({
    where: { businessId, title, createdAt: { gte: new Date(Date.now() - 24 * 3_600_000) } },
    select: { id: true },
  });
  if (recent) return;
  await sendPushToBusiness(businessId, {
    title,
    body: `You have reached the ${limit} appointments included in your plan this month, so customers cannot book online. Upgrade to reopen your booking page.`,
    url: "/dashboard/billing",
    tag: "booking-limit",
  }).catch(() => {});
}

async function POST_handler(req: NextRequest) {
  const rl = await rateLimit(`booking:${clientIp(req)}`, 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many booking attempts. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  const parsed = await parseBody(req, bookingSchema);
  if (!parsed.ok) return parsed.res;
  const { businessSlug, staffId, date, time: timeInput, tokenSessionId, clientName, clientEmail, clientPhone, notes } = parsed.data;
  // The appointment is for the booker unless they entered another person's name.
  const patientName = (parsed.data.patientName ?? clientName).trim();

  // Support serviceIds[] (multi-service) and legacy serviceId (single)
  const serviceIds: string[] = parsed.data.serviceIds?.length ? parsed.data.serviceIds : [parsed.data.serviceId!];

  const business = await prisma.business.findUnique({
    where: { slug: businessSlug },
    include: { services: true },
  });
  if (!business) return NextResponse.json({ error: "Business not found." }, { status: 404 });

  // Per-contact limit: the "already has an appointment" answer must not be a cheap way to probe
  // whether a given person has booked, so one email gets a handful of attempts per hour.
  const contactLimit = await rateLimit(`booking-contact:${business.id}:${clientEmail.toLowerCase()}`, 12, 3_600_000);
  if (!contactLimit.ok) {
    return NextResponse.json(
      { error: "Too many booking attempts for this email. Please try again later." },
      { status: 429, headers: { "Retry-After": String(contactLimit.retryAfter) } },
    );
  }

  // India needs email and phone; elsewhere only email.
  const missing = missingContact(business.currency, { email: clientEmail, phone: clientPhone });
  if (missing) return NextResponse.json({ error: missing }, { status: 400 });

  // Plan limits. A lapsed plan falls back to Free limits; reaching the monthly
  // cap returns 402 with a customer-facing message (never an upgrade prompt).
  const bizTz = safeTimeZone(business.timezone);
  const limits = await getEffectiveLimits(business);
  const limitResponse = async () => {
    await notifyLimitReached(business.id, limits.maxMonthlyAppointments);
    return NextResponse.json(
      {
        error: `Online booking is unavailable right now, please contact ${business.name}${business.phone ? ` on ${business.phone}` : ""}.`,
        code: "LIMIT_REACHED",
      },
      { status: 402 },
    );
  };
  const monthStart = startOfBusinessMonth(bizTz);
  if (await checkLimit(business.id, "monthlyAppointments")) {
    return await limitResponse();
  }

  // Tenant isolation: a staff member must belong to this business.
  if (staffId) {
    const staffOk = await prisma.staff.findFirst({ where: { id: staffId, businessId: business.id }, select: { id: true } });
    if (!staffOk) return NextResponse.json({ error: "Staff member not found." }, { status: 404 });
  }

  const servicesMap = new Map(business.services.map(s => [s.id, s]));
  const orderedServices = serviceIds.map(id => servicesMap.get(id)).filter(Boolean) as typeof business.services;
  if (orderedServices.length !== new Set(serviceIds).size) return NextResponse.json({ error: "Services not found." }, { status: 404 });
  if (orderedServices.some(s => !s.isActive)) {
    return NextResponse.json({ error: "One of the selected services is no longer available." }, { status: 400 });
  }

  // A downgraded plan can no longer sell group (multi-spot) services online.
  if (await checkLimit(business.id, "group", { capacity: Math.max(1, orderedServices[0].capacity ?? 1) })) {
    return NextResponse.json({ error: "This service can't be booked online right now. Please contact the business." }, { status: 402 });
  }

  const totalPrice = orderedServices.reduce((sum, s) => sum + s.price, 0);
  const totalDuration = orderedServices.reduce((sum, s) => sum + s.duration, 0);
  const serviceNamesLabel = orderedServices.map(s => s.name).join(" & ");

  // Cashfree online payments (flag): when on, they decide for every business and the legacy
  // Razorpay prepaid path below is skipped. Charge 0 confirms at once.
  const onlinePayments = isFeatureEnabled("onlinePayments");
  const payConfig = onlinePayments ? await getPayConfig(business) : null;
  if (onlinePayments && !payConfig && process.env.NODE_ENV === "production" && business.currency?.toUpperCase() === "INR") {
    return NextResponse.json({ error: "Online payments are temporarily unavailable. Please try again later." }, { status: 503 });
  }
  const charge = chargeFor(payConfig, totalPrice);
  if (charge.chargeMinor > 0 && !clientPhone) {
    return NextResponse.json({ error: "A phone number is needed to pay online." }, { status: 400 });
  }

  // Token businesses book a numbered place in a session; there is no clock time to choose.
  if (business.bookingMode === "TOKEN") {
    if (!tokenSessionId) return NextResponse.json({ error: "Please choose a session." }, { status: 400 });
    try {
      return await bookToken({
        business, services: orderedServices, tokenSessionId, date, tz: bizTz,
        client: { name: clientName, email: clientEmail, phone: clientPhone },
        notes, maxMonthlyAppointments: limits.maxMonthlyAppointments, monthStart, payConfig, patientName,
      });
    } catch (err) {
      if (err instanceof DuplicatePatientError) return NextResponse.json({ error: err.message, code: err.code }, { status: 409 });
      if (err instanceof LimitReachedError) return await limitResponse();
      throw err;
    }
  }
  if (!timeInput) return NextResponse.json({ error: "Please choose a time." }, { status: 400 });
  const time = timeInput;

  // Server-side slot validation. The availability endpoint is advisory only,
  // so we re-check here authoritatively. Wall-clock input is read in the
  // business's own timezone and stored as a UTC instant.
  const tz = bizTz;
  const appointmentStart = zonedTimeToUtc(date, time, tz);
  if (isNaN(appointmentStart.getTime())) {
    return NextResponse.json({ error: "Invalid date or time." }, { status: 400 });
  }
  if (isPastBooking(appointmentStart.getTime())) {
    return NextResponse.json({ error: "That time has already passed. Please pick a future slot." }, { status: 400 });
  }

  const capacity = Math.max(1, orderedServices[0].capacity ?? 1);
  const conflictResponse = () =>
    NextResponse.json({ error: conflictMessage(capacity) }, { status: 409 });

  // Which staff can take this start (working hours, time off, notice, buffers,
  // service links all applied). "Any available" arrives with no staffId.
  const query = { businessId: business.id, date, serviceIds, staffId: staffId || null };
  const availability = await loadAvailability(prisma, query);
  if (!availability.ok) return NextResponse.json({ error: "Services not found." }, { status: 404 });
  const option = availability.available.get(time);
  if (!option) return conflictResponse();
  const candidates = option.resourceIds;
  let chosenStaffId: string | null = candidates[0] ?? null;

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

  // For each candidate (preference order) take the lock on that staff member,
  // re-check the slot inside the lock with the same engine, then insert. If a
  // concurrent booking took it, fall through to the next candidate.
  async function createAppointment(
    clientId: string,
    paymentStatus: string,
    paymentModeVal: string,
    holdExpiresAt: Date | null = null,
  ) {
    for (const cand of candidates) {
      try {
        const appt = await bookExclusive(
          prisma,
          {
            businessId: business!.id,
            staffId: cand,
            start: appointmentStart,
            durationMin: totalDuration,
            capacity,
            verify: async (tx) => {
              // Monthly cap re-checked under its own business lock (after the staff
              // lock) so parallel bookings for different staff cannot overshoot it.
              await assertMonthlyHeadroom(tx, business!.id, limits.maxMonthlyAppointments, monthStart);
              // Same person twice on a day is refused. Under a per-patient lock, so two parallel
              // requests (even for different staff) cannot both pass.
              await assertNoDuplicatePatient(tx, { businessId: business!.id, clientId, patientName, date, tz });
              const r = await loadAvailability(tx, { ...query, staffId: cand });
              return r.ok && (r.available.get(time)?.resourceIds.includes(cand) ?? false);
            },
          },
          (tx) =>
            tx.appointment.create({
              data: {
                businessId: business!.id,
                clientId,
                staffId: cand,
                serviceId: orderedServices[0].id,
                date: appointmentStart,
                endAt: new Date(appointmentStart.getTime() + totalDuration * 60_000),
                bufferBeforeMin: availability.ok ? availability.bufferBeforeMin : 0,
                bufferAfterMin: availability.ok ? availability.bufferAfterMin : 0,
                duration: totalDuration,
                price: totalPrice,
                status: holdExpiresAt ? PENDING_PAYMENT : "confirmed",
                holdExpiresAt,
                patientName,
                notes: combinedNotes,
                paymentStatus,
                paymentMode: paymentModeVal,
              },
            }),
        );
        chosenStaffId = cand;
        return appt;
      } catch (err) {
        if (!(err instanceof SlotConflictError)) throw err;
      }
    }
    throw new SlotConflictError(capacity);
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
    const staffMember = chosenStaffId
      ? await prisma.staff.findFirst({ where: { id: chosenStaffId, businessId: business!.id }, select: { name: true } })
      : null;

    sendPushToBusiness(business!.id, {
      title: "New booking received",
      body: `${patientName} — ${serviceNamesLabel} on ${dateLabel} at ${time}`,
      url: "/dashboard/appointments",
      tag: "new-booking",
    }).catch(() => {});

    try {
      await sendBookingConfirmation({
        to: clientEmail,
        clientName,
        patientName,
        businessName: business!.name,
        serviceName: serviceNamesLabel,
        staffName: staffMember?.name ?? `Your ${t(business!, "staff")}`,
        terms: business!,
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

  const getOrCreateClient = () =>
    findOrCreateClient(prisma, business!.id, { name: clientName, email: clientEmail, phone: clientPhone }, bizTz);

  let client: Awaited<ReturnType<typeof getOrCreateClient>>;

  // Online payments on: hold the slot while the customer pays, or confirm when nothing is due.
  if (onlinePayments) {
    client = await getOrCreateClient();
    const hold = charge.chargeMinor > 0 ? holdExpiry() : null;
    const venueMode = business.onlinePayMode === "FULL_ONLINE" && hold ? "prepaid" : "postpaid";
    let appointment;
    try {
      appointment = await createAppointment(client.id, "unpaid", venueMode, hold);
    } catch (err) {
      if (err instanceof DuplicatePatientError) return NextResponse.json({ error: err.message, code: err.code }, { status: 409 });
      if (err instanceof SlotConflictError) return conflictResponse();
      if (err instanceof LimitReachedError) return await limitResponse();
      throw err;
    }
    if (!hold) {
      await notify(appointment.id, 0);
      return NextResponse.json({ success: true, appointmentId: appointment.id, paymentMode: "postpaid" });
    }
    const started = await startCheckout({
      appointmentId: appointment.id, businessId: business.id, businessName: business.name,
      currency: business.currency ?? DEFAULT_CURRENCY, charge, holdExpiresAt: hold,
      client: { id: client.id, name: clientName, email: clientEmail, phone: clientPhone! },
      note: `${serviceNamesLabel} ${date} ${time}`,
    });
    if (!started.ok) return NextResponse.json({ error: started.error, code: "PAYMENT_START_FAILED" }, { status: 502 });
    return NextResponse.json({ success: true, appointmentId: appointment.id, pendingPayment: true, checkout: started.checkout });
  }

  // Postpaid path — create appointments directly, client pays at visit
  if (paymentMode === "postpaid") {
    client = await getOrCreateClient();
    let appointment;
    try {
      appointment = await createAppointment(client.id, "unpaid", "postpaid");
    } catch (err) {
      if (err instanceof DuplicatePatientError) return NextResponse.json({ error: err.message, code: err.code }, { status: 409 });
      if (err instanceof SlotConflictError) return conflictResponse();
      if (err instanceof LimitReachedError) return await limitResponse();
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
    // The slot was checked above (non-binding); it is stored once the payment confirms.
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
        staffId: chosenStaffId ?? "",
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
    if (err instanceof DuplicatePatientError) return NextResponse.json({ error: err.message, code: err.code }, { status: 409 });
      if (err instanceof SlotConflictError) return conflictResponse();
    if (err instanceof LimitReachedError) return await limitResponse();
    throw err;
  }
  await notify(appointment.id, totalPrice);
  return NextResponse.json({ success: true, appointmentId: appointment.id });
}

export const POST = safeRoute(POST_handler);
