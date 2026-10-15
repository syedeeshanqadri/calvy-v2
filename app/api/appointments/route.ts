import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLimits, isActivePlan } from "@/lib/plans";
import { sendBookingConfirmation } from "@/lib/email";
import { findClientByEmail } from "@/lib/email-normalize";
import { sendPushToBusiness } from "@/lib/push";
import { parseBody, parseQuery } from "@/lib/validation/common";
import { appointmentCreateSchema, appointmentListQuery } from "@/lib/validation/appointments";
import { logger } from "@/lib/logger";
import { bookExclusive, SlotConflictError, conflictMessage } from "@/lib/booking";
import { safeTimeZone, zonedDayRange, zonedTimeToUtc, utcToZoned, formatDateLabel } from "@/lib/time";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const q = parseQuery(request.url, appointmentListQuery);
  if (!q.ok) return q.res;
  const { date, status, staffId } = q.data;

  const biz = await prisma.business.findUnique({ where: { id: session.user.businessId }, select: { timezone: true } });
  const tz = safeTimeZone(biz?.timezone);

  const where: Record<string, unknown> = { businessId: session.user.businessId };
  if (date) {
    const { start, end } = zonedDayRange(date, tz);
    where.date = { gte: start, lt: end };
  }
  if (status) where.status = status;
  if (staffId) where.staffId = staffId;

  const appointments = await prisma.appointment.findMany({
    where,
    include: { client: true, service: true, staff: true },
    orderBy: { date: "asc" },
  });

  const rows = appointments.map(a => ({
    id: a.id,
    clientName: a.client.name,
    serviceName: a.service.name,
    staffName: a.staff?.name ?? null,
    date: utcToZoned(a.date, tz).date,
    time: utcToZoned(a.date, tz).time,
    duration: a.duration,
    price: a.price,
    status: a.status,
    paymentStatus: a.paymentStatus,
  }));

  return NextResponse.json({ appointments: rows, total: rows.length });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = await parseBody(request, appointmentCreateSchema);
  if (!parsed.ok) return parsed.res;
  const { clientName, clientEmail, clientPhone, staffId, date, time, notes, allowOverlap } = parsed.data;

  // Support serviceIds[] (multi) and legacy serviceId (single)
  const serviceIds: string[] = parsed.data.serviceIds?.length ? parsed.data.serviceIds : [parsed.data.serviceId!];

  // Plan limit check + fetch business name in one query
  const business = await prisma.business.findUnique({
    where: { id: session.user.businessId },
    select: { name: true, plan: true, planStatus: true, trialEndsAt: true, currency: true, timezone: true },
  });
  if (!business || !isActivePlan(business.planStatus, business.plan, business.trialEndsAt)) {
    return NextResponse.json({ error: "Your trial has expired. Please upgrade to continue.", code: "PLAN_EXPIRED" }, { status: 402 });
  }
  const limits = getLimits(business.plan);
  if (limits.maxMonthlyAppointments !== -1) {
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);
    const count = await prisma.appointment.count({ where: { businessId: session.user.businessId, createdAt: { gte: monthStart } } });
    if (count >= limits.maxMonthlyAppointments) {
      return NextResponse.json({ error: `Monthly appointment limit (${limits.maxMonthlyAppointments}) reached. Upgrade your plan.`, code: "LIMIT_REACHED" }, { status: 402 });
    }
  }

  const allServices = await prisma.service.findMany({
    where: { id: { in: serviceIds }, businessId: session.user.businessId },
  });
  if (allServices.length !== new Set(serviceIds).size) {
    return NextResponse.json({ error: "Services not found" }, { status: 404 });
  }
  // Preserve the order of selection
  const orderedServices = serviceIds.map(id => allServices.find(s => s.id === id)).filter(Boolean) as typeof allServices;

  const totalPrice = orderedServices.reduce((sum, s) => sum + s.price, 0);
  const totalDuration = orderedServices.reduce((sum, s) => sum + s.duration, 0);
  const serviceNamesLabel = orderedServices.map(s => s.name).join(" & ");

  // Encode extra service names in notes using the same __services__: prefix
  const combinedNotes = (() => {
    const prefix = orderedServices.length > 1
      ? `__services__:${orderedServices.slice(1).map(s => s.name).join("|")}`
      : "";
    if (prefix && notes) return `${prefix}\n${notes}`;
    if (prefix) return prefix;
    return notes || "";
  })();

  const tz = safeTimeZone(business.timezone);
  const apptDate = zonedTimeToUtc(date, time, tz);
  if (isNaN(apptDate.getTime())) {
    return NextResponse.json({ error: "Invalid date or time." }, { status: 400 });
  }

  const client =
    (await findClientByEmail(prisma, session.user.businessId, clientEmail)) ??
    (await prisma.client.create({
      data: {
        businessId: session.user.businessId,
        name: clientName,
        email: clientEmail,
        phone: clientPhone || "",
      },
    }));

  const staffMember = staffId
    ? await prisma.staff.findFirst({ where: { id: staffId, businessId: session.user.businessId }, select: { name: true } })
    : null;
  if (staffId && !staffMember) {
    return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
  }

  // Same conflict rule as public bookings, under the same lock. The owner may
  // explicitly allow an overlap (allowOverlap: true).
  const capacity = Math.max(1, orderedServices[0].capacity ?? 1);
  const businessId = session.user.businessId;
  let appointment;
  try {
    appointment = await bookExclusive(
      prisma,
      { businessId, start: apptDate, durationMin: totalDuration, capacity, allowOverlap },
      (tx) =>
        tx.appointment.create({
          data: {
            businessId,
            clientId: client.id,
            serviceId: orderedServices[0].id,
            staffId: staffId || null,
            date: apptDate,
            endAt: new Date(apptDate.getTime() + totalDuration * 60_000),
            duration: totalDuration,
            price: totalPrice,
            notes: combinedNotes,
            status: "confirmed",
            paymentStatus: "unpaid",
          },
        }),
    );
  } catch (err) {
    if (err instanceof SlotConflictError) {
      return NextResponse.json({ error: conflictMessage(capacity), code: "SLOT_CONFLICT" }, { status: 409 });
    }
    throw err;
  }

  const dateLabel = formatDateLabel(apptDate, tz);

  sendPushToBusiness(session.user.businessId, {
    title: "New appointment booked",
    body: `${clientName} — ${serviceNamesLabel} on ${dateLabel} at ${time}`,
    url: "/dashboard/appointments",
    tag: "new-booking",
  }).catch(() => {});

  try {
    await sendBookingConfirmation({
      to: clientEmail,
      clientName,
      businessName: business?.name ?? "Your provider",
      serviceName: serviceNamesLabel,
      staffName: staffMember?.name ?? "Your provider",
      date: dateLabel,
      time,
      duration: totalDuration,
      price: totalPrice,
      currency: business.currency ?? "USD",
      appointmentDate: apptDate,
    });
  } catch (err) {
    logger.error("[Email] Failed to send confirmation for panel booking:", { err });
  }

  return NextResponse.json({ appointment }, { status: 201 });
}
