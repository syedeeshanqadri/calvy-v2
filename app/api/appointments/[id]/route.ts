import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { accessSession, appointmentWhere, scopeOf } from "@/lib/access";
import { can, ForbiddenError } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { parseBody } from "@/lib/validation/common";
import { appointmentPatchSchema } from "@/lib/validation/appointments";
import { notify } from "@/lib/notifications/enqueue";
import { cancellation, meetingLink, noticeFrom, receipt, reschedule, statusChange } from "@/lib/notifications/events";
import { logger } from "@/lib/logger";
import { bookExclusive, SlotConflictError, conflictMessage, isPastBooking } from "@/lib/booking";
import { loadAvailability, type AvailabilityQuery } from "@/lib/availability";
import { safeTimeZone, formatDateLabel, formatTimeLabel, zonedTimeToUtc, utcToZoned } from "@/lib/time";
import { settleCancellation } from "@/lib/holds";
import { refundPayment } from "@/lib/onlinePayment";
import { removeCreditForReturn } from "@/lib/creditDb";
import { meetingUrlFor } from "@/lib/online";
import { ownerAlert, reviewRequestFor } from "@/lib/notifications/business";

export const dynamic = 'force-dynamic';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://calvy.io";

async function PATCH_handler(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await accessSession(["appointments.write", "appointments.cancel"]);
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const appointment = await prisma.appointment.findFirst({
    where: { id: params.id, businessId: session.user.businessId, ...appointmentWhere(session.access) },
  });
  if (!appointment) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }

  const parsed = await parseBody(req, appointmentPatchSchema);
  if (!parsed.ok) return parsed.res;
  const { status, paymentStatus, paymentMode, date, time, staffId, meetingUrl } = parsed.data;
  const businessId = session.user.businessId;
  // Cancelling needs "cancel"; any other change needs "create & edit"; own-only members may not hand an appointment to someone else.
  if (!session.access.isOwner) {
    const perms = session.access.permissions;
    const cancelling = status === "cancelled";
    const otherChange = paymentStatus !== undefined || paymentMode !== undefined || date !== undefined || staffId !== undefined || meetingUrl !== undefined || (status !== undefined && !cancelling);
    if ((cancelling && !can(perms, "appointments.cancel")) || (otherChange && !can(perms, "appointments.write"))) throw new ForbiddenError();
    if (scopeOf(session.access).kind !== "all" && staffId !== undefined && staffId !== session.access.staffId) throw new ForbiddenError();
  }

  const biz = await prisma.business.findUnique({ where: { id: businessId }, select: { timezone: true } });
  const tz = safeTimeZone(biz?.timezone);
  const fmtDate = (d: Date) => formatDateLabel(d, tz);
  const fmtTime = (d: Date) => formatTimeLabel(d, tz);

  // Detect transitions (before applying the update)
  const willCancel = status === "cancelled" && appointment.status !== "cancelled";
  const willPay = paymentStatus === "paid" && appointment.paymentStatus !== "paid";
  // The desk records that the fee was handed back (cash/UPI).
  const willReturnFee = paymentStatus === "refunded" && appointment.paymentStatus !== "refunded";
  const willComplete = status === "completed" && appointment.status !== "completed";
  const willNoShow = status === "no-show" && appointment.status !== "no-show";

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

  // A link is only for online appointments. Empty clears it (the service / staff link applies again).
  if (meetingUrl !== undefined && !appointment.isOnline) {
    return NextResponse.json({ error: "Only online appointments have a meeting link." }, { status: 400 });
  }
  const before = await prisma.appointment.findFirst({
    where: { id: appointment.id, businessId },
    include: { service: { select: { meetingUrl: true } }, staff: { select: { meetingUrl: true } } },
  });
  const linkBefore = before ? meetingUrlFor(before) : null;

  const data = {
    ...(meetingUrl !== undefined && { meetingUrl: meetingUrl || null }),
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
              data: { ...data, staffId: cand, date: newDate, endAt: new Date(newDate!.getTime() + appointment.duration * 60_000), reminderSent: false },
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

  // A fee returned by hand takes the matching credit out of the customer's wallet, so they are not paid twice.
  if (willReturnFee) {
    await prisma.$transaction((tx) => removeCreditForReturn(tx, { businessId, clientId: appointment.clientId, appointmentId: appointment.id }));
  }

  // The business cancelling a booking paid online refunds it in full, platform fee included.
  if (willCancel) {
    const paid = await prisma.payment.findFirst({ where: { appointmentId: appointment.id, businessId, status: "PAID" } });
    if (paid) {
      const { refundMinor } = settleCancellation({ by: "business", paidMinor: paid.amountMinor });
      if (await refundPayment(paid.id, refundMinor, "Cancelled by the business")) {
        updated = await prisma.appointment.update({ where: { id: appointment.id }, data: { paymentStatus: "refunded" } });
      } else {
        // Refused when the payment already became wallet credit (missed or cancelled at reception).
        logger.warn("[Appointments] no refund on cancel: already credited to the wallet, or the gateway refused", { appointmentId: appointment.id, paymentId: paid.id });
      }
    }
  }

  // Queue the matching customer emails. Each event has a key of its own (booking + move/link/payment), so a double
  // click or a retry is still one email. Whether it is sent (business switches, unsubscribes) is decided in notify().
  if (willCancel || willReschedule || willPay || willComplete || willNoShow) {
    try {
      const full = await prisma.appointment.findFirst({
        where: { id: params.id, businessId: session.user.businessId },
        include: { client: true, service: true, staff: true, business: true },
      });
      if (full) {
        const n = noticeFrom(full);
        const rebookUrl = `${APP_URL}/${full.business.slug}`;
        const move = willReschedule ? { from: appointment.date, to: full.date, oldDate: fmtDate(appointment.date), oldTime: fmtTime(appointment.date) } : null;
        await notify(
          willCancel ? await ownerAlert(n, "cancelled")
            : move ? await ownerAlert(n, "rescheduled", { version: `${move.from.getTime()}>${move.to.getTime()}`, oldDate: move.oldDate, oldTime: move.oldTime })
            : willComplete ? await ownerAlert(n, "status", { version: "completed", statusLabel: "completed" })
            : willNoShow ? await ownerAlert(n, "status", { version: "no_show", statusLabel: "marked as a no-show" })
            : null,
          willPay && !willCancel ? await ownerAlert(n, "paid") : null,
          willComplete ? await reviewRequestFor(n, full.business) : null,
        );
        await notify(
          willCancel ? cancellation(n, rebookUrl)
            : move ? reschedule(n, move)
            : willComplete ? statusChange(n, "completed", rebookUrl)
            : willNoShow ? statusChange(n, "no_show", rebookUrl)
            : null,
          willPay && !willCancel ? receipt(n) : null,
        );
      }
    } catch (err) {
      logger.error("[Appointments] customer notification error:", { err });
    }
  }

  // The customer is told when staff add or change the joining link (not for cancelled or finished bookings).
  if (meetingUrl !== undefined && !willCancel && ["confirmed", "pending"].includes(updated?.status ?? "")) {
    try {
      const full = await prisma.appointment.findFirst({
        where: { id: params.id, businessId },
        include: { client: true, service: true, staff: true, business: true },
      });
      const linkAfter = full ? meetingUrlFor(full) : null;
      if (full && linkAfter && linkAfter !== linkBefore) await notify(meetingLink(noticeFrom(full), linkAfter, !!linkBefore));
    } catch (err) {
      logger.error("[Appointments] meeting link notification error:", { err });
    }
  }

  return NextResponse.json({ appointment: updated });
}

async function DELETE_handler(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await accessSession("appointments.cancel");
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const appointment = await prisma.appointment.findFirst({
    where: { id: params.id, businessId: session.user.businessId, ...appointmentWhere(session.access) },
  });
  if (!appointment) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }

  await prisma.appointment.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}

export const PATCH = safeRoute(PATCH_handler);
export const DELETE = safeRoute(DELETE_handler);
