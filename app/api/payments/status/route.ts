import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { reconcileOrder } from "@/lib/onlinePayment";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { parseQuery } from "@/lib/validation/common";
import { formatDateLabel, formatTimeLabel, safeTimeZone } from "@/lib/time";

export const dynamic = "force-dynamic";

const query = z.object({ order_id: z.string().regex(/^calvy_[A-Za-z0-9_-]{1,60}$/, "invalid order id") });

// Public: where a paid booking stands after checkout (the return page polls this). Reconciles with
// the gateway so bookings confirm even before the webhook arrives. No personal data in the answer.
async function GET_handler(request: NextRequest) {
  const q = parseQuery(request.url, query);
  if (!q.ok) return q.res;
  const limit = await rateLimit(`payment-status:${clientIp(request)}`, 30, 60_000);
  if (!limit.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });

  const { view, appointmentId } = await reconcileOrder(q.data.order_id);
  if (view === "unknown" || !appointmentId) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const a = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      date: true, estimatedAt: true, tokenNumber: true, holdExpiresAt: true,
      service: { select: { name: true } }, staff: { select: { name: true } }, tokenSession: { select: { name: true } },
      business: { select: { name: true, slug: true, timezone: true } },
    },
  });
  if (!a) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  const tz = safeTimeZone(a.business.timezone);
  return NextResponse.json({
    view,
    booking: {
      businessName: a.business.name, businessSlug: a.business.slug, serviceName: a.service.name,
      staffName: a.staff?.name ?? null, date: formatDateLabel(a.date, tz), time: formatTimeLabel(a.estimatedAt ?? a.date, tz),
      token: a.tokenNumber ? { number: a.tokenNumber, sessionName: a.tokenSession?.name ?? "" } : null,
      holdExpiresAt: view === "pending" ? a.holdExpiresAt : null,
    },
  });
}

export const GET = safeRoute(GET_handler);
