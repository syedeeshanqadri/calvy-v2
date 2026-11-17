import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notify as queueNotification } from "@/lib/notifications/enqueue";
import { confirmation, type Notice } from "@/lib/notifications/events";
import { ownerAlert } from "@/lib/notifications/business";
import { t } from "@/lib/terms";
import { sendPushToBusiness } from "@/lib/push";
import { shortName } from "@/lib/pushRouting";
import { DEFAULT_CURRENCY } from "@/lib/currency";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { findOrCreateClient } from "@/lib/clients";
import { recordWhatsAppConsent, whatsappOffered } from "@/lib/whatsapp/consent";
import { parseBody } from "@/lib/validation/common";
import { bookingSchema } from "@/lib/validation/bookings";
import { isPastBooking, bookExclusive, SlotConflictError, conflictMessage } from "@/lib/booking";
import { loadAvailability } from "@/lib/availability";
import { getEffectiveLimits } from "@/lib/getFeatures";
import { checkLimit, startOfBusinessMonth, assertMonthlyHeadroom, LimitReachedError } from "@/lib/limits";
import { zonedTimeToUtc, formatDateLabel, safeTimeZone } from "@/lib/time";
import { logger } from "@/lib/logger";
import { bookToken } from "@/lib/tokenBooking";
import { ensureCustomerAccount } from "@/lib/customerInvite";
import { appBaseUrl } from "@/lib/auth-http";
import { missingContact } from "@/lib/patients";
import { tryNormalizeEmail } from "@/lib/email-normalize";
import { normalizePhone } from "@/lib/phone";
import { assertNoDuplicatePatient, assertWithinPeopleCap, contactAtDailyCap, DuplicatePatientError } from "@/lib/patientsDb";
import { isFeatureEnabled } from "@/lib/flags";
import { PENDING_PAYMENT, holdExpiry } from "@/lib/holds";
import { chargeFor, defaultGateway, getPayConfig, startCheckout } from "@/lib/onlinePayment";
import { resolveBookingMode, resolveMeetingUrl } from "@/lib/online";
import { loadMeetingUrl } from "@/lib/onlineDb";
import { Prisma } from "@prisma/client";
import { suspended, suspendedResponse } from "@/lib/suspension";
import { checkVerifiedLimits, getVerifiedLimits, isVerifiedBooker } from "@/lib/verifiedLimits";
import { FollowUpTicketError, resolveFollowUp } from "@/lib/followUpDb";
import { claimWaiver, waiverAvailable } from "@/lib/waiver";
import { WaiverTakenError } from "@/lib/tokenBooking";
import { claimReward, rewardAvailable, progressFor, RewardTakenError } from "@/lib/rewards/service";
import { rewardApplies } from "@/lib/rewards/rules";
import { toMinor } from "@/lib/fees";

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
  }, { kind: "announcement", subjectId: `booking-limit:${businessId}:${new Date().toISOString().slice(0, 10)}` }).catch(() => {});
}

async function bookingHandler(req: NextRequest) {
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
  const bookingForOther = !!parsed.data.patientName;

  // Support serviceIds[] (multi-service) and legacy serviceId (single)
  const serviceIds: string[] = parsed.data.serviceIds?.length ? parsed.data.serviceIds : [parsed.data.serviceId!];

  const business = await prisma.business.findUnique({
    where: { slug: businessSlug },
    include: { services: true },
  });
  if (!business) return NextResponse.json({ error: "Business not found." }, { status: 404 });
  if (suspended(business)) return suspendedResponse(business.name);
  // A verified customer (proved by one of their own signed links) is held to the admin-set limits; guests keep the guest rules below.
  const verifiedBooker = await isVerifiedBooker(prisma, [parsed.data.verifiedTicket, parsed.data.followUpTicket], clientEmail);
  if (verifiedBooker) {
    const verdict = await checkVerifiedLimits(prisma, { businessId: business.id, businessName: business.name, email: clientEmail, limits: await getVerifiedLimits(prisma) });
    if (!verdict.ok) return NextResponse.json({ error: verdict.message, code: verdict.code }, { status: verdict.status });
  }
  // Who the booking is for: relation for anyone else; age and gender only where the clinic pack asks for them.
  const patientDetails = bookingForOther
    ? {
        patientRelation: parsed.data.patientRelation ?? null,
        patientAge: business.packId === "CLINIC" ? parsed.data.patientAge ?? null : null,
        patientGender: business.packId === "CLINIC" ? parsed.data.patientGender ?? null : null,
      }
    : { patientRelation: null, patientAge: null, patientGender: null };

  // The "already has an appointment" answer tells a caller that someone has booked, so a contact that
  // has received a handful of those answers is put on a cooldown: until it ends, EVERY booking for
  // that contact gets the same 429 FROM THAT REQUESTER (contact plus IP), whatever the booking
  // state, so the cooldown itself reveals nothing. It is keyed on the requester too, so a stranger can
  // only put themselves in cooldown, never lock the contact's owner out; ordinary bookings never count.
  // Contact keys use the normalised email and phone the client lookup matches on.
  const requester = clientIp(req);
  const contactKeys = [
    `booking-dup:${business.id}:${requester}:email:${tryNormalizeEmail(clientEmail) ?? clientEmail.trim().toLowerCase()}`,
    ...(normalizePhone(clientPhone, business.timezone) ? [`booking-dup:${business.id}:${requester}:phone:${normalizePhone(clientPhone, business.timezone)}`] : []),
  ];
  const DUP_ANSWERS_PER_HOUR = 6;
  const cooldownResponse = (retryAfter: number) =>
    NextResponse.json({ error: "Too many attempts for this contact. Please try again later." }, { status: 429, headers: { "Retry-After": String(retryAfter) } });
  for (const key of contactKeys) {
    const open = await rateLimit.peek(key, DUP_ANSWERS_PER_HOUR, 3_600_000);
    if (!open.ok) return cooldownResponse(open.retryAfter);
  }
  async function duplicateResponse(err: DuplicatePatientError): Promise<NextResponse> {
    let retryAfter = 0;
    for (const key of contactKeys) {
      const l = await rateLimit(key, DUP_ANSWERS_PER_HOUR, 3_600_000);
      if (!l.ok) retryAfter = Math.max(retryAfter, l.retryAfter);
    }
    return retryAfter > 0 ? cooldownResponse(retryAfter) : NextResponse.json({ error: err.message, code: err.code }, { status: 409 });
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

  // In person or online: forced by the service, or the customer's choice when it is offered both ways.
  const modeResult = resolveBookingMode(orderedServices[0], parsed.data.mode);
  if (!modeResult.ok) return NextResponse.json({ error: modeResult.error, code: "MODE_REQUIRED" }, { status: 400 });
  const isOnline = modeResult.isOnline;

  // Free follow-up: a verified customer's ticket, the same doctor and service, the same person, inside the window.
  // Anything else (another doctor, a later date, someone else) is an ordinary paid booking. A bad or expired
  // ticket is refused rather than silently charged.
  let followUpOfId: string | null = null;
  if (parsed.data.followUpTicket) {
    let doctorId: string | null = staffId ?? null;
    if (business.bookingMode === "TOKEN" && tokenSessionId) {
      doctorId = (await prisma.tokenSession.findFirst({ where: { id: tokenSessionId, businessId: business.id }, select: { staffId: true } }))?.staffId ?? null;
    }
    try {
      const r = await resolveFollowUp(prisma, {
        ticket: parsed.data.followUpTicket, business: { id: business.id, timezone: business.timezone, followUpDays: business.followUpDays },
        staffId: doctorId, serviceIds, date, patientName, bookerEmail: clientEmail,
      });
      followUpOfId = r.followUpOfId;
    } catch (err) {
      if (err instanceof FollowUpTicketError) return NextResponse.json({ error: err.message, code: "FOLLOW_UP_EXPIRED" }, { status: 400 });
      throw err;
    }
  }
  const followUpTaken = (err: unknown) =>
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002" && String(err.meta?.target ?? "").includes("followUpOfId");
  const followUpTakenResponse = () =>
    NextResponse.json({ error: "Your free follow-up has already been used. Please book again as a new appointment.", code: "FOLLOW_UP_USED" }, { status: 409 });

  const totalPrice = followUpOfId ? 0 : orderedServices.reduce((sum, s) => sum + s.price, 0);
  const totalDuration = orderedServices.reduce((sum, s) => sum + s.duration, 0);
  const serviceNamesLabel = orderedServices.map(s => s.name).join(" & ");

  // Online payments (flag): Basic pays Calvy's Rs 10 confirmation fee, Mid/Top pay the business's own default gateway.
  // Charge 0 confirms at once.
  const onlinePayments = isFeatureEnabled("onlinePayments");
  const payConfig = onlinePayments ? await getPayConfig(business) : null;
  if (onlinePayments && !payConfig && process.env.NODE_ENV === "production" && business.currency?.toUpperCase() === "INR") {
    return NextResponse.json({ error: "Online payments are temporarily unavailable. Please try again later." }, { status: 503 });
  }
  const charge = chargeFor(payConfig, orderedServices.map((sv) => ({ serviceId: sv.id, price: followUpOfId ? 0 : sv.price })));
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
        notes, maxMonthlyAppointments: limits.maxMonthlyAppointments, monthStart, payConfig, patientName, patientDetails, followUpOfId,
        maxPeoplePerBooker: business.maxPeoplePerBooker, isOnline, verifiedBooker,
      });
    } catch (err) {
      if (err instanceof DuplicatePatientError) return await duplicateResponse(err);
      if (err instanceof LimitReachedError) return await limitResponse();
      if (followUpTaken(err)) return followUpTakenResponse();
      if (err instanceof WaiverTakenError || err instanceof RewardTakenError) return NextResponse.json({ error: err.message, code: "WAIVER_CHANGED" }, { status: 409 });
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
    waive = false,
    reward = false,
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
              await assertWithinPeopleCap(tx, { businessId: business!.id, clientId, patientName, bookerName: clientName, date, tz, max: business!.maxPeoplePerBooker });
              suppressContactMessages = await contactAtDailyCap(tx, { businessId: business!.id, clientId });
              const r = await loadAvailability(tx, { ...query, staffId: cand });
              return r.ok && (r.available.get(time)?.resourceIds.includes(cand) ?? false);
            },
          },
          async (tx) => {
            const created = await tx.appointment.create({
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
                followUpOfId,
                status: holdExpiresAt ? PENDING_PAYMENT : "confirmed",
                holdExpiresAt,
                isOnline,
                patientName,
                ...patientDetails,
                notes: combinedNotes,
                paymentStatus,
                paymentMode: paymentModeVal,
              },
            });
            // The waiver is claimed in the booking's own transaction: two parallel bookings cannot both skip the fee.
            if (waive && !(await claimWaiver(tx, { businessId: business!.id, clientId, appointmentId: created.id }))) throw new WaiverTakenError();
            // Same for the loyalty reward: spent inside the booking's own transaction.
            if (reward && !(await claimReward(tx, { appointmentId: created.id, email: clientEmail, phone: clientPhone }))) throw new RewardTakenError();
            return created;
          },
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
  // Set when this contact already had a day's quota of bookings: the booking still goes through, but
  // no email or WhatsApp is sent to the contact (a flood protection that never blocks anyone).
  let suppressContactMessages = false;

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
      ? await prisma.staff.findFirst({ where: { id: chosenStaffId, businessId: business!.id }, select: { name: true, meetingUrl: true } })
      : null;

    sendPushToBusiness(business!.id, {
      title: "New booking received",
      body: `${shortName(patientName)} · ${serviceNamesLabel} · ${dateLabel} ${time}`,
      url: `/dashboard/appointments?open=${appointmentId}`,
      tag: "new-booking",
    }, { kind: "booking_new", staffId: chosenStaffId, subjectId: appointmentId, version: "created" }).catch(() => {});

    try {
      const notice: Notice = {
        appointmentId,
        businessId: business!.id,
        to: clientEmail,
        payload: {
          clientName,
          patientName,
          businessName: business!.name,
          serviceName: serviceNamesLabel,
          staffName: staffMember?.name ?? `Your ${t(business!, "staff")}`,
          date: dateLabel,
          time,
          duration: totalDuration,
          price: totalPrice,
          currency: business!.currency ?? DEFAULT_CURRENCY,
          online: isOnline ? { meetingUrl: resolveMeetingUrl(orderedServices[0], staffMember) } : undefined,
        },
      };
      // The business is always told; the contact only when not over its daily cap.
      await queueNotification(suppressContactMessages ? null : confirmation(notice, appointmentStart, await progressFor(prisma, { email: clientEmail, phone: clientPhone })), await ownerAlert(notice, "created"));
    } catch (err) {
      logger.error("[Notifications] confirmation failed:", { err });
    }
  }

  const getOrCreateClient = async () => {
    const c = await findOrCreateClient(prisma, business!.id, { name: clientName, email: clientEmail, phone: clientPhone }, bizTz);
    // "Get updates on WhatsApp": recorded only if the business offers it and the number is really this client's.
    if (parsed.data.whatsappConsent && clientPhone) {
      try {
        if (await whatsappOffered(business!.id)) await recordWhatsAppConsent(prisma, c, clientPhone, bizTz, parsed.data.whatsappConsentSource ?? "booking_form");
      } catch (err) {
        logger.error("[WhatsApp] consent not recorded:", { err });
      }
    }
    return c;
  };

  let client: Awaited<ReturnType<typeof getOrCreateClient>>;

  // Online payments on: hold the slot while the customer pays, or confirm when nothing is due.
  if (onlinePayments) {
    client = await getOrCreateClient();
    // A kept Rs 10 confirmation fee (earlier booking cancelled or not attended) waives the fee once at this business.
    let payCharge = charge;
    let waived = false;
    if (charge.route === "CALVY" && charge.chargeMinor > 0 && (await waiverAvailable(prisma, business.id, client.id))) {
      payCharge = { chargeMinor: 0, platformFeeMinor: 0, businessShareMinor: 0, route: "NONE" };
      waived = true;
    }
    // A loyalty reward (every 8th attended visit) waives the Rs 10 the same way, for a verified customer only. The kept-fee
    // rebooking above goes first, so one booking never spends both.
    let rewarded = false;
    if (!waived && verifiedBooker && rewardApplies(charge) && (await rewardAvailable(prisma, { email: clientEmail, phone: clientPhone }))) {
      payCharge = { chargeMinor: 0, platformFeeMinor: 0, businessShareMinor: 0, route: "NONE" };
      rewarded = true;
    }
    const gateway = payCharge.route === "GATEWAY" ? await defaultGateway(business.id) : null;
    if (payCharge.route === "GATEWAY" && !gateway) return NextResponse.json({ error: "Online payments are temporarily unavailable. Please try again later.", code: "PAYMENT_START_FAILED" }, { status: 503 });
    const hold = payCharge.chargeMinor > 0 ? holdExpiry() : null;
    // Paid in full online = prepaid; a deposit or the Rs 10 fee leaves the rest to pay at the venue.
    const venueMode = payCharge.route === "GATEWAY" && payCharge.chargeMinor >= toMinor(totalPrice) && hold ? "prepaid" : "postpaid";
    let appointment;
    try {
      appointment = await createAppointment(client.id, "unpaid", venueMode, hold, waived, rewarded);
    } catch (err) {
      if (err instanceof WaiverTakenError || err instanceof RewardTakenError) return NextResponse.json({ error: err.message, code: "WAIVER_CHANGED" }, { status: 409 });
      if (err instanceof DuplicatePatientError) return await duplicateResponse(err);
      if (err instanceof SlotConflictError) return conflictResponse();
      if (err instanceof LimitReachedError) return await limitResponse();
      if (followUpTaken(err)) return followUpTakenResponse();
      throw err;
    }
    if (!hold) {
      await notify(appointment.id, 0);
      return NextResponse.json({ success: true, appointmentId: appointment.id, paymentMode: "postpaid", confirmationWithheld: suppressContactMessages, isOnline, meetingUrl: isOnline ? await loadMeetingUrl(appointment.id) : null, rewarded, reward: verifiedBooker ? await progressFor(prisma, { email: clientEmail, phone: clientPhone }) : null });
    }
    const started = await startCheckout({
      appointmentId: appointment.id, businessId: business.id, businessName: business.name,
      currency: business.currency ?? DEFAULT_CURRENCY, charge: payCharge, holdExpiresAt: hold,
      client: { id: client.id, name: clientName, email: clientEmail, phone: clientPhone! },
      note: `${serviceNamesLabel} ${date} ${time}`, gateway,
    });
    if (!started.ok) return NextResponse.json({ error: started.error, code: "PAYMENT_START_FAILED" }, { status: 502 });
    return NextResponse.json({ success: true, appointmentId: appointment.id, pendingPayment: true, checkout: started.checkout, isOnline });
  }

  // Online payments off (or unavailable): the booking is confirmed and the client pays at the visit.
  client = await getOrCreateClient();
  let appointment;
  try {
    appointment = await createAppointment(client.id, "unpaid", "postpaid");
  } catch (err) {
    if (err instanceof DuplicatePatientError) return await duplicateResponse(err);
    if (err instanceof SlotConflictError) return conflictResponse();
    if (err instanceof LimitReachedError) return await limitResponse();
    if (followUpTaken(err)) return followUpTakenResponse();
    throw err;
  }
  await notify(appointment.id, 0);
  return NextResponse.json({ success: true, appointmentId: appointment.id, paymentMode: "postpaid", confirmationWithheld: suppressContactMessages, isOnline, meetingUrl: isOnline ? await loadMeetingUrl(appointment.id) : null });
}

/**
 * Every successful booking also makes sure the booker's email has a customer account (created without a
 * password, with an emailed "verify and set your password" link). The booking never depends on it; the
 * response says so the success screen can tell them to check their inbox. Skipped when contact messages
 * were held back (daily cap), so this cannot be used to send repeated emails to an address.
 */
async function POST_handler(req: NextRequest) {
  const raw = (await req.clone().json().catch(() => null)) as { clientEmail?: unknown; clientName?: unknown } | null;
  const res = await bookingHandler(req);
  if (!res.ok) return res;
  const data = (await res.clone().json().catch(() => null)) as Record<string, unknown> | null;
  if (!data?.success || data.confirmationWithheld) return res;
  let baseUrl: string | undefined;
  try { baseUrl = appBaseUrl(req); } catch { baseUrl = undefined; }
  const account = await ensureCustomerAccount({
    email: typeof raw?.clientEmail === "string" ? raw.clientEmail : null,
    name: typeof raw?.clientName === "string" ? raw.clientName : "",
    baseUrl,
  });
  if (!account) return res;
  return NextResponse.json({ ...data, account }, { status: res.status, headers: res.headers });
}

export const POST = safeRoute(POST_handler);
