import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseBody } from "@/lib/validation/common";
import { appointmentPatchSchema } from "@/lib/validation/appointments";
import { sendBookingCancellation, sendBookingReschedule, sendInvoice, type BookingDetails } from "@/lib/email";
import { logger } from "@/lib/logger";
import { bookExclusive, SlotConflictError, conflictMessage, isPastBooking } from "@/lib/booking";
import { loadAvailability, type AvailabilityQuery } from "@/lib/availability";
import { safeTimeZone, formatDateLabel, formatTimeLabel, zonedTimeToUtc, utcToZoned } from "@/lib/time";

export const dynamic = 'force-dynamic';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://calvy.io";

async function PATCH_handler(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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
  const { status, paymentStatus, paymentMode, date, time, staffId } = parsed.data;
  const businessId = session.user.businessId;

  const biz = await prisma.business.findUnique({ where: { id: businessId }, select: { timezone: true } });
  const tz = safeTimeZone(biz?.timezone);
  const fmtDate = (d: Date) => formatDateLabel(d, tz);
  const fmtTime = (d: Date) => formatTimeLabel(d, tz);

  // Detect transitions (before applying the update)
  const willCancel = status === "cancelled" && appointment.status !== "cancelled";
  const willPay = paymentStatus === "paid" && appointment.paymentStatus !== "paid";

  // Reschedule: a new date + time and/or another staff member. Cancelling in the
  // same request wins; the move is ignored.
  let newDate: Date | undefined;
  let targetStaffId: string | null = appointment.staffId;
  if (!willCancel && (date !== undefined || (staffId !== undefined && staffId !== appointment.staffId))) {
    if (["cancelled", "no-show", "completed"].includes(appointment.status)) {
      return NextResponse.json({ error: "Cancelled, completed or no-show appointments can't be rescheduled." }, { status: 400 });
    }
    const current = utcToZoned(appointment.date, tz);
    const start = zonedTimeToUtc(date ?? current.date, time ?? current.time, tz);
    if (isNaN(start.getTime())) return NextResponse.json({ error: "Invalid date or time." }, { status: 400 });
    if (staffId !== undefined) {
      const staffOk = await prisma.staff.findFirst({ where: { id: staffId, businessId }, select: { id: true } });
      if (!staffOk) return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
      targetStaffId = staffId;
    }
    const moved = start.getTime() !== appointment.date.getTime() || targetStaffId !== appointment.staffId;
    if (moved) {
      if (start.getTime() !== appointment.date.getTime() && isPastBooking(start.getTime())) {
        return NextResponse.json({ error: "That time has already passed." }, { status: 400 });
      }
      newDate = start;
    }
  }
  const willReschedule = !!newDate;

  const data = {
    ...(status && { status }),
    ...(paymentStatus && { paymentStatus }),
    ...(paymentMode && { paymentMode }),
  };

  let updated;
  if (willReschedule && newDate) {
    // Moving re-checks the slot with the availability engine (working hours, time
    // off, buffers, service links), ignoring this appointment's own slot, and
    // writes under the same lock the booking routes use.
    const service = await prisma.service.findUnique({ where: { id: appointment.serviceId }, select: { capacity: true } });
    const capacity = Math.max(1, service?.capacity ?? 1);
    const dateStr = utcToZoned(newDate, tz).date;
    const timeStr = utcToZoned(newDate, tz).time;
    const base: Omit<AvailabilityQuery, "serviceIds"> = {
      businessId,
      date: dateStr,
      staffId: targetStaffId,
      ownerMode: true,
      excludeAppointmentId: appointment.id,
      durationMin: appointment.duration,
    };
    // The service may have been retired since; fall back to a duration-only check.
    let query: AvailabilityQuery = { ...base, serviceIds: [appointment.serviceId] };
    let availability = await loadAvailability(prisma, query);
    if (!availability.ok) {
      query = { ...base, serviceIds: [], fallbackDurationMin: appointment.duration };
      availability = await loadAvailability(prisma, query);
    }
    const option = availability.ok ? availability.available.get(timeStr) : undefined;
    if (!availability.ok || !option) {
      return NextResponse.json({ error: conflictMessage(capacity), code: "SLOT_CONFLICT" }, { status: 409 });
    }

    let moved = false;
    for (const cand of option.resourceIds) {
      try {
        updated = await bookExclusive(
          prisma,
          {
            businessId,
            staffId: cand,
            start: newDate,
            durationMin: appointment.duration,
            capacity,
            excludeId: appointment.id,
            verify: async (tx) => {
              const r = await loadAvailability(tx, { ...query, staffId: cand });
              return r.ok && (r.available.get(timeStr)?.resourceIds.includes(cand) ?? false);
            },
          },
          (tx) =>
            tx.appointment.update({
              where: { id: params.id },
              data: { ...data, staffId: cand, date: newDate, endAt: new Date(newDate!.getTime() + appointment.duration * 60_000) },
            }),
        );
        moved = true;
        break;
      } catch (err) {
        if (!(err instanceof SlotConflictError)) throw err;
      }
    }
    if (!moved) {
      return NextResponse.json({ error: conflictMessage(capacity), code: "SLOT_CONFLICT" }, { status: 409 });
    }
  } else {
    updated = await prisma.appointment.update({ where: { id: params.id }, data });
  }

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

async function DELETE_handler(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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

export const PATCH = safeRoute(PATCH_handler);
export const DELETE = safeRoute(DELETE_handler);
