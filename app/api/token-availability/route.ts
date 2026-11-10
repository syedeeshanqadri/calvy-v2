import { safeRoute } from "@/lib/api";
import { suspended, suspendedResponse } from "@/lib/suspension";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loadTokenDay } from "@/lib/tokenBooking";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { parseQuery } from "@/lib/validation/common";
import { tokenAvailabilityQuery } from "@/lib/validation/bookings";
import { safeTimeZone } from "@/lib/time";

export const dynamic = "force-dynamic";

// Public: sessions open on a date for a token business, with how many tokens are left.
async function GET_handler(request: NextRequest) {
  const q = parseQuery(request.url, tokenAvailabilityQuery);
  if (!q.ok) return q.res;
  const { slug, date, serviceIds } = q.data;

  const limit = await rateLimit(`token-availability:${clientIp(request)}`, 60, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  }

  const business = await prisma.business.findUnique({
    where: { slug },
    select: { id: true, name: true, timezone: true, maxAdvanceDays: true, bookingMode: true, suspendedAt: true },
  });
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });
  if (suspended(business)) return suspendedResponse(business.name);
  if (business.bookingMode !== "TOKEN") return NextResponse.json({ error: "This business books by time slot." }, { status: 400 });

  const result = await loadTokenDay({ id: business.id, timezone: safeTimeZone(business.timezone), maxAdvanceDays: business.maxAdvanceDays }, date, serviceIds);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ sessions: result.sessions, nextAvailable: result.nextAvailable });
}

export const GET = safeRoute(GET_handler);
