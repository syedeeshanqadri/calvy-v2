import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseQuery } from "@/lib/validation/common";
import { ownerSlotsQuery } from "@/lib/validation/appointments";
import { loadAvailability, type AvailabilityQuery } from "@/lib/availability";

export const dynamic = "force-dynamic";

/**
 * Start times the owner can book or move an appointment to, from the same
 * availability engine the public booking page uses (working hours, time off,
 * buffers, service links), minus the customer notice/advance rules. Pass
 * `excludeId` when rescheduling so the appointment does not block its own slot.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const businessId = session?.user?.businessId;
  if (!businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = parseQuery(request.url, ownerSlotsQuery);
  if (!q.ok) return q.res;
  const { date, staffId, excludeId } = q.data;

  const base: Omit<AvailabilityQuery, "serviceIds"> = { businessId, date, staffId: staffId ?? null, ownerMode: true };
  let serviceIds = q.data.serviceIds;

  if (excludeId) {
    const appt = await prisma.appointment.findFirst({
      where: { id: excludeId, businessId },
      select: { id: true, serviceId: true, duration: true },
    });
    if (!appt) return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
    serviceIds = [appt.serviceId];
    base.excludeAppointmentId = appt.id;
    base.durationMin = appt.duration;
  } else if (serviceIds.length === 0) {
    return NextResponse.json({ error: "Choose a service first." }, { status: 400 });
  }

  if (staffId) {
    const ok = await prisma.staff.findFirst({ where: { id: staffId, businessId }, select: { id: true } });
    if (!ok) return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
  }

  let result = await loadAvailability(prisma, { ...base, serviceIds });
  if (!result.ok && excludeId && result.reason === "service") {
    // The service was retired after this booking: check the duration only.
    result = await loadAvailability(prisma, { ...base, serviceIds: [], fallbackDurationMin: base.durationMin });
  }
  if (!result.ok) return NextResponse.json({ error: "Services not found" }, { status: 404 });

  const times = Array.from(result.available.entries())
    .map(([time, opt]) => ({
      time,
      staffIds: opt.resourceIds.filter((r): r is string => !!r),
      spots: opt.spots,
    }))
    .sort((a, b) => a.time.localeCompare(b.time));

  return NextResponse.json({ times, all: result.all, durationMin: result.durationMin });
}
