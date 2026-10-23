import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loadMonthAvailability } from "@/lib/availability";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { parseQuery } from "@/lib/validation/common";
import { monthAvailabilityQuery } from "@/lib/validation/bookings";

export const dynamic = "force-dynamic";

/** Which days of a month have a free slot for the chosen services and staff, plus the next bookable day when the month is full. */
export async function GET(request: NextRequest) {
  const q = parseQuery(request.url, monthAvailabilityQuery);
  if (!q.ok) return q.res;
  const { slug, month, duration, serviceIds = [], staffId = null } = q.data;

  const limit = await rateLimit(`availability-month:${clientIp(request)}`, 30, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const business = await prisma.business.findUnique({ where: { slug }, select: { id: true } });
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const result = await loadMonthAvailability(prisma, {
    businessId: business.id,
    month,
    serviceIds,
    fallbackDurationMin: duration,
    staffId,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.reason === "service" ? "Service not found" : "Business not found" }, { status: 404 });
  }
  return NextResponse.json({ timezone: result.tz, days: result.days, nextAvailable: result.nextAvailable });
}
