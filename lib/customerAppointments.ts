import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { t } from "@/lib/terms";
import { logger } from "@/lib/logger";
import { sendBookingCancellation, sendBookingReschedule, type BookingDetails } from "@/lib/email";
import { sendPushToBusiness } from "@/lib/push";
import { bookExclusive, SlotConflictError, conflictMessage, isPastBooking } from "@/lib/booking";
import { loadAvailability, type AvailabilityQuery } from "@/lib/availability";
import { creditClosedBooking } from "@/lib/creditDb";
import { formatDateLabel, formatTimeLabel, safeTimeZone, zonedTimeToUtc } from "@/lib/time";
import { manageability } from "@/lib/customerView";
import { beforeCancellationCutoff } from "@/lib/holds";
import { meetingUrlFor } from "@/lib/online";

/**
 * A signed-in customer cancelling or moving their own booking. Every function takes the VERIFIED email
 * of the customer and only ever touches a booking made with that email (the same match /my uses).
 */

export type Fail = { ok: false; status: number; error: string; code?: string };
const fail = (status: number, error: string, code?: string): Fail => ({ ok: false, status, error, code });

/** The booking was cancelled or moved by someone else between our check and our write. */
class StaleBookingError extends Error {}

const include = {
  client: { select: { id: true, name: true, email: true } },
  service: { select: { name: true, meetingUrl: true } },
  staff: { select: { name: true, meetingUrl: true } },
  business: true,
} satisfies Prisma.AppointmentInclude;

type Owned = Prisma.AppointmentGetPayload<{ include: typeof include }>;

/** The booking, only if it belongs to this customer's email. */
export async function findOwned(verifiedEmail: string, id: string): Promise<Owned | null> {
  return prisma.appointment.findFirst({
    where: { id, client: { email: { equals: verifiedEmail, mode: "insensitive" } } },
    include,
  });
}

function details(a: Owned, tz: string): BookingDetails | null {
  if (!a.client.email) return null;
  return {
    to: a.client.email, clientName: a.client.name, patientName: a.patientName ?? undefined, businessName: a.business.name,
    serviceName: a.service.name, staffName: a.staff?.name ?? `Your ${t(a.business, "staff")}`, terms: a.business,
    date: formatDateLabel(a.date, tz), time: formatTimeLabel(a.date, tz), duration: a.duration, price: a.price,
    currency: a.business.currency ?? "INR", appointmentDate: a.date,
    online: a.isOnline ? { meetingUrl: meetingUrlFor(a) } : undefined,
    ctx: { appointmentId: a.id, businessId: a.businessId },
  };
}

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "https://calvy.io";

/** Times this booking could move to on `date` (same staff member and service; its own slot counts as free). */
export async function rescheduleSlots(verifiedEmail: string, id: string, date: string): Promise<{ ok: true; times: { time: string }[] } | Fail> {
  const a = await findOwned(verifiedEmail, id);
  if (!a) return fail(404, "Booking not found.");
  const can = manageability(a, new Date());
  if (!can.ok) return fail(409, can.reason, can.code);

  const base: Omit<AvailabilityQuery, "serviceIds"> = {
    businessId: a.businessId, date, staffId: a.staffId, excludeAppointmentId: a.id, durationMin: a.duration,
  };
  let result = await loadAvailability(prisma, { ...base, serviceIds: [a.serviceId] });
  if (!result.ok) result = await loadAvailability(prisma, { ...base, serviceIds: [], fallbackDurationMin: a.duration });
  if (!result.ok) return fail(404, "No times available.");
  const times = Array.from(result.available.keys()).sort().map((time) => ({ time }));
  return { ok: true, times };
}

/** Move the booking to another date and time (same staff member), re-checked under the booking lock. */
export async function rescheduleByCustomer(verifiedEmail: string, id: string, date: string, time: string): Promise<{ ok: true; dateLabel: string; timeLabel: string } | Fail> {
  const a = await findOwned(verifiedEmail, id);
  if (!a) return fail(404, "Booking not found.");
  const can = manageability(a, new Date());
  if (!can.ok) return fail(409, can.reason, can.code);

  const tz = safeTimeZone(a.business.timezone);
  const start = zonedTimeToUtc(date, time, tz);
  if (Number.isNaN(start.getTime())) return fail(400, "Invalid date or time.");
  if (isPastBooking(start.getTime())) return fail(400, "That time has already passed. Please pick a later one.");
  if (start.getTime() === a.date.getTime()) return fail(400, "That is the time you already have.");
  // The new time must also be outside the business's cutoff, not just the old one.
  const hours = a.business.cancellationCutoffHours ?? 0;
  if (!beforeCancellationCutoff(start, hours, new Date())) {
    return fail(409, `Appointments can be booked at least ${hours} hour${hours === 1 ? "" : "s"} ahead. Please pick a later time or contact ${a.business.name}.`, "CUTOFF");
  }

  const capacityRow = await prisma.service.findUnique({ where: { id: a.serviceId }, select: { capacity: true } });
  const capacity = Math.max(1, capacityRow?.capacity ?? 1);
  const base: Omit<AvailabilityQuery, "serviceIds"> = { businessId: a.businessId, date, staffId: a.staffId, excludeAppointmentId: a.id, durationMin: a.duration };
  let query: AvailabilityQuery = { ...base, serviceIds: [a.serviceId] };
  let availability = await loadAvailability(prisma, query);
  if (!availability.ok) {
    query = { ...base, serviceIds: [], fallbackDurationMin: a.duration };
    availability = await loadAvailability(prisma, query);
  }
  const option = availability.ok ? availability.available.get(time) : undefined;
  if (!availability.ok || !option) return fail(409, conflictMessage(capacity), "SLOT_CONFLICT");

  const oldDate = a.date;
  let saved = false;
  for (const cand of option.resourceIds) {
    try {
      await bookExclusive(
        prisma,
        {
          businessId: a.businessId, staffId: cand, start, durationMin: a.duration, capacity, excludeId: a.id,
          verify: async (tx) => {
            const r = await loadAvailability(tx, { ...query, staffId: cand });
            return r.ok && (r.available.get(time)?.resourceIds.includes(cand) ?? false);
          },
        },
        async (tx) => {
          // Guarded on the state we checked (still live, still at the old time), so a cancel or a business
          // edit that lands in between makes this a no-op instead of resurrecting or double-moving the booking.
          const moved = await tx.appointment.updateMany({
            where: { id: a.id, status: { in: ["confirmed", "pending"] }, date: oldDate },
            // The reminder goes out again for the new time.
            data: { staffId: cand, date: start, endAt: new Date(start.getTime() + a.duration * 60_000), reminderSent: false },
          });
          if (moved.count !== 1) throw new StaleBookingError();
          return moved;
        },
      );
      saved = true;
      break;
    } catch (err) {
      if (err instanceof StaleBookingError) return fail(409, "This booking was changed in the meantime. Please refresh and try again.", "STATUS");
      if (!(err instanceof SlotConflictError)) throw err;
    }
  }
  if (!saved) return fail(409, conflictMessage(capacity), "SLOT_CONFLICT");

  const dateLabel = formatDateLabel(start, tz);
  const timeLabel = formatTimeLabel(start, tz);

  // Business: the booking itself moved, so its dashboard shows it at once; plus a notification.
  sendPushToBusiness(a.businessId, {
    title: "Appointment rescheduled by the customer",
    body: `${a.client.name} moved ${a.service.name} from ${formatDateLabel(oldDate, tz)} ${formatTimeLabel(oldDate, tz)} to ${dateLabel} ${timeLabel}`,
    url: "/dashboard/appointments", tag: "customer-reschedule",
  }).catch(() => {});
  // Customer: email with the new time.
  const d = details({ ...a, date: start }, tz);
  if (d) {
    try {
      await sendBookingReschedule({ ...d, oldDate: formatDateLabel(oldDate, tz), oldTime: formatTimeLabel(oldDate, tz) });
    } catch (err) {
      logger.error("[CustomerAppt] reschedule email failed", { err });
    }
  }
  return { ok: true, dateLabel, timeLabel };
}

/** Cancel the booking. Anything paid online becomes credit at that business; a customer cancellation is never refunded to the card. */
export async function cancelByCustomer(verifiedEmail: string, id: string): Promise<{ ok: true; credit: { amountMinor: number; currency: string } | null } | Fail> {
  const a = await findOwned(verifiedEmail, id);
  if (!a) return fail(404, "Booking not found.");
  const can = manageability(a, new Date());
  if (!can.ok) return fail(409, can.reason, can.code);

  const credit = await prisma.$transaction(async (tx) => {
    // Guarded on the status we just checked, so two quick clicks cancel once.
    const claimed = await tx.appointment.updateMany({ where: { id: a.id, status: { in: ["confirmed", "pending"] } }, data: { status: "cancelled" } });
    if (claimed.count !== 1) return "already" as const;
    return creditClosedBooking(tx, { businessId: a.businessId, clientId: a.client.id, appointmentId: a.id, kind: "CANCELLED", note: "Cancelled by the customer" });
  });
  if (credit === "already") return fail(409, "This booking was already cancelled.", "STATUS");

  const tz = safeTimeZone(a.business.timezone);
  sendPushToBusiness(a.businessId, {
    title: "Appointment cancelled by the customer",
    body: `${a.client.name} cancelled ${a.service.name} on ${formatDateLabel(a.date, tz)} at ${formatTimeLabel(a.date, tz)}`,
    url: "/dashboard/appointments", tag: "customer-cancel",
  }).catch(() => {});
  const d = details(a, tz);
  if (d) {
    try {
      await sendBookingCancellation({ ...d, rebookUrl: `${appUrl()}/${a.business.slug}` });
    } catch (err) {
      logger.error("[CustomerAppt] cancellation email failed", { err });
    }
  }
  return { ok: true, credit };
}
