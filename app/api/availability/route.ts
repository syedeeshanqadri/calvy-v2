import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateSlots, parseHHMM } from "@/lib/booking";
import { safeTimeZone, weekdayOf, zonedDayRange, utcToZoned } from "@/lib/time";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { parseQuery } from "@/lib/validation/common";
import { availabilityQuery } from "@/lib/validation/bookings";

export const dynamic = 'force-dynamic';

function safeAvailability(json: string | null): Record<string, { enabled: boolean; start: string; end: string }> {
  if (!json || json === "{}") return {};
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export async function GET(request: NextRequest) {
  const q = parseQuery(request.url, availabilityQuery);
  if (!q.ok) return q.res;
  const { slug, date, duration: serviceDuration, serviceId = null } = q.data;

  const limit = await rateLimit(`availability:${clientIp(request)}`, 60, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const business = await prisma.business.findUnique({
    where: { slug },
    select: { id: true, availabilityJson: true, slotInterval: true, timezone: true },
  });
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const rawInterval = (business as { slotInterval?: number }).slotInterval ?? 30;
  const slotInterval = Number.isInteger(rawInterval) && rawInterval >= 5 && rawInterval <= 240 ? rawInterval : 30;

  // Parse availability settings
  const availability = safeAvailability(business.availabilityJson);

  // `date` is a calendar day in the business timezone, not a UTC day.
  const tz = safeTimeZone(business.timezone);
  const dayOfWeek = weekdayOf(date);
  const dayConfig = availability[String(dayOfWeek)];

  const workStart = parseHHMM(dayConfig?.start) !== null ? dayConfig!.start : "09:00";
  const workEnd = parseHHMM(dayConfig?.end) !== null ? dayConfig!.end : "18:00";
  const isWorkingDay = dayConfig ? dayConfig.enabled : dayOfWeek >= 1 && dayOfWeek <= 5;

  if (!isWorkingDay) {
    return NextResponse.json({ slots: [], bookedSlots: [] });
  }

  const allSlots = generateSlots(workStart, workEnd, slotInterval);

  // Fetch service capacity if serviceId provided
  let capacity = 1;
  if (serviceId) {
    const service = await prisma.service.findFirst({
      where: { id: serviceId, businessId: business.id },
      select: { capacity: true },
    });
    capacity = (service as { capacity?: number } | null)?.capacity ?? 1;
  }

  // Fetch existing appointments for the day
  const { start: dayStart, end: dayEnd } = zonedDayRange(date, tz);
  const booked = await prisma.appointment.findMany({
    where: {
      businessId: business.id,
      date: { gte: dayStart, lt: dayEnd },
      status: { notIn: ["cancelled", "no-show"] },
    },
    select: { date: true, duration: true, serviceId: true },
  });

  const workEndMinutes = parseHHMM(workEnd) ?? 18 * 60;

  if (capacity > 1) {
    // Group booking: count how many bookings start at each exact slot time
    const bookingCountBySlot = new Map<string, number>();
    for (const appt of booked) {
      const key = utcToZoned(appt.date, tz).time;
      bookingCountBySlot.set(key, (bookingCountBySlot.get(key) ?? 0) + 1);
    }

    const spotsMap: Record<string, number> = {};
    const available = allSlots.filter(slot => {
      const [h, m] = slot.split(":").map(Number);
      const slotStart = h * 60 + m;
      // Slot must fit within working hours
      if (slotStart + serviceDuration > workEndMinutes) return false;
      const count = bookingCountBySlot.get(slot) ?? 0;
      spotsMap[slot] = Math.max(0, capacity - count);
      return count < capacity;
    });

    return NextResponse.json({
      slots: available,
      bookedSlots: allSlots.filter(s => !available.includes(s)),
      isGroup: true,
      capacity,
      spotsMap,
    });
  }

  // Individual booking: block all minutes covered by any appointment
  const blockedMinutes = new Set<number>();
  for (const appt of booked) {
    const start = utcToZoned(appt.date, tz).minutes;
    for (let t = start; t < start + appt.duration; t++) {
      blockedMinutes.add(t);
    }
  }

  const available = allSlots.filter(slot => {
    const [h, m] = slot.split(":").map(Number);
    const slotStart = h * 60 + m;
    if (slotStart + serviceDuration > workEndMinutes) return false;
    for (let t = slotStart; t < slotStart + serviceDuration; t++) {
      if (blockedMinutes.has(t)) return false;
    }
    return true;
  });

  return NextResponse.json({
    slots: available,
    bookedSlots: allSlots.filter(s => !available.includes(s)),
    isGroup: false,
    capacity: 1,
  });
}
