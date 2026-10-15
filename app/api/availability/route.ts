import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateSlots, parseHHMM } from "@/lib/booking";
import { rateLimit, clientIp } from "@/lib/ratelimit";

export const dynamic = 'force-dynamic';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("slug");
  const date = searchParams.get("date"); // YYYY-MM-DD
  const rawDuration = Math.floor(Number(searchParams.get("duration") || "30"));
  const serviceDuration = Number.isFinite(rawDuration) ? Math.min(1440, Math.max(1, rawDuration)) : 30;
  const serviceId = searchParams.get("serviceId") ?? null;

  if (!slug || !date) {
    return NextResponse.json({ error: "slug and date are required" }, { status: 400 });
  }
  if (slug.length > 100) {
    return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
  }
  if (!DATE_RE.test(date) || Number.isNaN(new Date(date + "T00:00:00Z").getTime())) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }

  const limit = await rateLimit(`availability:${clientIp(request)}`, 60, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const business = await prisma.business.findUnique({
    where: { slug },
    select: { id: true, availabilityJson: true, slotInterval: true },
  });
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const rawInterval = (business as { slotInterval?: number }).slotInterval ?? 30;
  const slotInterval = Number.isInteger(rawInterval) && rawInterval >= 5 && rawInterval <= 240 ? rawInterval : 30;

  // Parse availability settings
  const availability = safeAvailability(business.availabilityJson);

  const dateObj = new Date(date + "T00:00:00Z");
  const dayOfWeek = dateObj.getUTCDay();
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
  const dayStart = new Date(date + "T00:00:00Z");
  const dayEnd = new Date(date + "T23:59:59Z");
  const booked = await prisma.appointment.findMany({
    where: {
      businessId: business.id,
      date: { gte: dayStart, lte: dayEnd },
      status: { notIn: ["cancelled", "no-show"] },
    },
    select: { date: true, duration: true, serviceId: true },
  });

  const workEndMinutes = parseHHMM(workEnd) ?? 18 * 60;

  if (capacity > 1) {
    // Group booking: count how many bookings start at each exact slot time
    const bookingCountBySlot = new Map<string, number>();
    for (const appt of booked) {
      const h = new Date(appt.date).getUTCHours().toString().padStart(2, "0");
      const m = new Date(appt.date).getUTCMinutes().toString().padStart(2, "0");
      const key = `${h}:${m}`;
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
    const apptH = new Date(appt.date).getUTCHours();
    const apptM = new Date(appt.date).getUTCMinutes();
    const start = apptH * 60 + apptM;
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
