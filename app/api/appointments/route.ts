import { safeRoute } from "@/lib/api";
import { suspended, suspendedResponse } from "@/lib/suspension";
import { NextRequest, NextResponse } from "next/server";
import { accessSession, appointmentWhere, scopeOf } from "@/lib/access";
import { ForbiddenError } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications/enqueue";
import { confirmation, type Notice } from "@/lib/notifications/events";
import { ownerAlert } from "@/lib/notifications/business";
import { t } from "@/lib/terms";
import { findOrCreateClient } from "@/lib/clients";
import { sendPushToBusiness } from "@/lib/push";
import { parseBody, parseQuery } from "@/lib/validation/common";
import { appointmentCreateSchema, appointmentListQuery } from "@/lib/validation/appointments";
import { logger } from "@/lib/logger";
import { resolveMeetingUrl } from "@/lib/online";
import { bookExclusive, SlotConflictError, conflictMessage } from "@/lib/booking";
import { loadAvailability } from "@/lib/availability";
import { getEffectiveLimits } from "@/lib/getFeatures";
import { checkLimit, denialResponse, startOfBusinessMonth, assertMonthlyHeadroom, LimitReachedError } from "@/lib/limits";
import { safeTimeZone, zonedDayRange, zonedTimeToUtc, utcToZoned, formatDateLabel } from "@/lib/time";

export const dynamic = 'force-dynamic';

async function GET_handler(request: NextRequest) {
  const session = await accessSession(["appointments.view_all", "appointments.view_own"]);
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
  // Own-only members: the scope always wins over a staffId filter in the query.
  Object.assign(where, appointmentWhere(session.access));

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

async function POST_handler(request: NextRequest) {
  const session = await accessSession("appointments.write");
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const businessId = session.user.businessId;

  const parsed = await parseBody(request, appointmentCreateSchema);
  if (!parsed.ok) return parsed.res;
  const { clientName, clientEmail, clientPhone, staffId, date, time, notes, allowOverlap } = parsed.data;
  // Own-only members can only book onto their own linked staff record.
  if (scopeOf(session.access).kind !== "all" && (!session.access.staffId || staffId !== session.access.staffId)) throw new ForbiddenError();

  // Support serviceIds[] (multi) and legacy serviceId (single)
  const serviceIds: string[] = parsed.data.serviceIds?.length ? parsed.data.serviceIds : [parsed.data.serviceId!];

  // Lapsed plan and monthly cap, both from PlanConfig.
  const denied = await checkLimit(businessId, "monthlyAppointments", { owner: true });
  if (denied) return denialResponse(denied);

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { name: true, plan: true, planStatus: true, trialEndsAt: true, currency: true, timezone: true, packId: true, termsOverride: true, suspendedAt: true },
  });
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });
  if (suspended(business)) return suspendedResponse(business.name);

  const allServices = await prisma.service.findMany({
    where: { id: { in: serviceIds }, businessId },
  });
  if (allServices.length !== new Set(serviceIds).size) {
    return NextResponse.json({ error: "Services not found" }, { status: 404 });
  }
  // Preserve the order of selection
  const orderedServices = serviceIds.map(id => allServices.find(s => s.id === id)).filter(Boolean) as typeof allServices;

  const capacity = Math.max(1, orderedServices[0].capacity ?? 1);
  const groupDenied = await checkLimit(businessId, "group", { capacity });
  if (groupDenied) return denialResponse(groupDenied);

  // Staff booking: ONLINE services are online, BOTH follows the chosen mode, IN_PERSON never is.
  const svcMode = orderedServices[0].mode;
  const isOnline = svcMode === "ONLINE" || (svcMode === "BOTH" && parsed.data.mode === "online");

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

  const staffMember = staffId
    ? await prisma.staff.findFirst({ where: { id: staffId, businessId }, select: { name: true, meetingUrl: true } })
    : null;
  if (staffId && !staffMember) {
    return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
  }

  // Which staff can take this start (working hours, time off, buffers and service
  // links applied). With no staff picked, "any available" takes the first free one
  // in the engine's preference order. The owner may explicitly allow an overlap.
  const query = { businessId, date, serviceIds, staffId: staffId || null, ownerMode: true };
  const availability = await loadAvailability(prisma, query);
  if (!availability.ok) return NextResponse.json({ error: "Services not found" }, { status: 404 });
  const option = availability.available.get(time);

  let candidates: (string | null)[];
  if (allowOverlap) {
    if (staffId) candidates = [staffId];
    else if (option) candidates = option.resourceIds;
    else {
      const activeStaff = await prisma.staff.count({ where: { businessId, isActive: true } });
      if (activeStaff > 0) {
        return NextResponse.json({ error: "Pick a staff member to book over an existing appointment." }, { status: 400 });
      }
      candidates = [null];
    }
  } else {
    if (!option) {
      return NextResponse.json(
        { error: staffId ? "That staff member is not available at this time." : conflictMessage(capacity), code: "SLOT_CONFLICT" },
        { status: 409 },
      );
    }
    candidates = option.resourceIds;
  }

  const client = await findOrCreateClient(prisma, businessId, { name: clientName, email: clientEmail, phone: clientPhone }, tz, { trusted: true });

  const limits = await getEffectiveLimits(business);
  const monthStart = startOfBusinessMonth(business.timezone);
  let appointment: Awaited<ReturnType<typeof prisma.appointment.create>> | undefined;
  let chosenStaffId: string | null = null;
  try {
    for (const cand of candidates) {
      try {
        appointment = await bookExclusive(
          prisma,
          {
            businessId,
            staffId: cand,
            start: apptDate,
            durationMin: totalDuration,
            capacity,
            allowOverlap,
            verify: async (tx) => {
              const r = await loadAvailability(tx, { ...query, staffId: cand });
              return r.ok && (r.available.get(time)?.resourceIds.includes(cand) ?? false);
            },
          },
          async (tx) => {
            await assertMonthlyHeadroom(tx, businessId, limits.maxMonthlyAppointments, monthStart);
            return tx.appointment.create({
              data: {
                businessId,
                clientId: client.id,
                serviceId: orderedServices[0].id,
                staffId: cand,
                date: apptDate,
                endAt: new Date(apptDate.getTime() + totalDuration * 60_000),
                bufferBeforeMin: orderedServices[0].bufferBeforeMin,
                bufferAfterMin: orderedServices[orderedServices.length - 1].bufferAfterMin,
                duration: totalDuration,
                price: totalPrice,
                notes: combinedNotes,
                status: "confirmed",
                paymentStatus: "unpaid",
                isOnline,
              },
            });
          },
        );
        chosenStaffId = cand;
        break;
      } catch (err) {
        if (!(err instanceof SlotConflictError)) throw err;
      }
    }
    if (!appointment) throw new SlotConflictError(capacity);
  } catch (err) {
    if (err instanceof SlotConflictError) {
      return NextResponse.json({ error: conflictMessage(capacity), code: "SLOT_CONFLICT" }, { status: 409 });
    }
    if (err instanceof LimitReachedError) {
      return NextResponse.json(
        { error: `Monthly appointment limit (${limits.maxMonthlyAppointments}) reached. Upgrade your plan.`, code: "LIMIT_REACHED" },
        { status: 402 },
      );
    }
    throw err;
  }

  const dateLabel = formatDateLabel(apptDate, tz);
  const assignedStaff = chosenStaffId
    ? (staffMember ?? (await prisma.staff.findFirst({ where: { id: chosenStaffId, businessId }, select: { name: true, meetingUrl: true } })))
    : null;
  const assignedName = assignedStaff?.name;

  sendPushToBusiness(businessId, {
    title: "New appointment booked",
    body: `${clientName} — ${serviceNamesLabel} on ${dateLabel} at ${time}`,
    url: "/dashboard/appointments",
    tag: "new-booking",
  }).catch(() => {});

  try {
    const notice: Notice = {
      appointmentId: appointment.id,
      businessId,
      to: client.email,
      payload: {
        clientName,
        businessName: business.name ?? `Your ${t(business, "staff")}`,
        serviceName: serviceNamesLabel,
        staffName: assignedName ?? `Your ${t(business, "staff")}`,
        date: dateLabel,
        time,
        duration: totalDuration,
        price: totalPrice,
        currency: business.currency ?? "USD",
        online: isOnline ? { meetingUrl: resolveMeetingUrl(orderedServices[0], assignedStaff) } : undefined,
      },
    };
    await notify(confirmation(notice, apptDate), await ownerAlert(notice, "created"));
  } catch (err) {
    logger.error("[Notifications] confirmation failed for panel booking:", { err });
  }

  return NextResponse.json({ appointment, staffId: chosenStaffId, staffName: assignedName ?? null }, { status: 201 });
}

export const GET = safeRoute(GET_handler);
export const POST = safeRoute(POST_handler);
