import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loadAvailability } from "@/lib/availability";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { parseQuery } from "@/lib/validation/common";
import { availabilityQuery } from "@/lib/validation/bookings";

export const dynamic = 'force-dynamic';

async function GET_handler(request: NextRequest) {
  const q = parseQuery(request.url, availabilityQuery);
  if (!q.ok) return q.res;
  const { slug, date, duration, serviceId = null, serviceIds: serviceIdsCsv, staffId = null } = q.data;

  const limit = await rateLimit(`availability:${clientIp(request)}`, 60, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const business = await prisma.business.findUnique({ where: { slug }, select: { id: true } });
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const serviceIds = serviceIdsCsv?.length ? serviceIdsCsv : serviceId ? [serviceId] : [];
  const result = await loadAvailability(prisma, {
    businessId: business.id,
    date,
    serviceIds,
    fallbackDurationMin: duration,
    staffId,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.reason === "service" ? "Service not found" : "Business not found" }, { status: 404 });
  }

  const slots = Array.from(result.available.keys()).sort();
  const bookedSlots = result.all.filter((s) => !result.available.has(s));
  const isGroup = result.capacity > 1;

  const staffBySlot: Record<string, string[]> = {};
  const spotsMap: Record<string, number> = {};
  for (const [time, opt] of result.available) {
    staffBySlot[time] = opt.resourceIds.filter((id): id is string => id !== null);
    if (isGroup) spotsMap[time] = opt.spots;
  }

  return NextResponse.json({
    slots,
    bookedSlots,
    isGroup,
    capacity: result.capacity,
    timezone: result.tz,
    staffBySlot,
    ...(isGroup ? { spotsMap } : {}),
  });
}

export const GET = safeRoute(GET_handler);
