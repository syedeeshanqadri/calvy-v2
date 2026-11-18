import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { FEED_MAX_EVENTS, buildFeed, feedWindow, parseCalendarToken, type FeedEvent } from "@/lib/calendarFeed";
import { serviceLabel } from "@/lib/notifications/events";

export const dynamic = "force-dynamic";

const STATUSES = ["confirmed", "completed", "cancelled", "no-show"];

// Public, no login: the secret token in the URL is the credential (like Google's "secret address in iCal format"), so Google,
// Outlook and Apple Calendar can subscribe. Never cached by shared caches; rate limited per IP and per token; an unknown token
// is a plain 404 (one answer for "bad" and "regenerated"), so tokens cannot be probed.
async function GET_handler(req: NextRequest, props: { params: Promise<{ token: string }> }) {
  const { token: segment } = await props.params;
  const ip = await rateLimit(`calfeed:${clientIp(req)}`, 120, 60_000);
  const perToken = await rateLimit(`calfeed-token:${segment.slice(0, 80)}`, 60, 60_000);
  if (!ip.ok || !perToken.ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(Math.max(ip.retryAfter, perToken.retryAfter)), "Cache-Control": "no-store" } });
  }
  const token = parseCalendarToken(segment);
  const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  if (!token) return notFound();

  const [business, staff] = await Promise.all([
    prisma.business.findUnique({ where: { calendarToken: token }, select: { id: true, name: true, suspendedAt: true } }),
    prisma.staff.findUnique({ where: { calendarToken: token }, select: { id: true, name: true, businessId: true, business: { select: { name: true, suspendedAt: true } } } }),
  ]);
  const scope = business
    ? { businessId: business.id, calName: `${business.name} bookings`, suspended: !!business.suspendedAt, staffId: undefined as string | undefined }
    : staff
      ? { businessId: staff.businessId, calName: `${staff.name} at ${staff.business.name}`, suspended: !!staff.business.suspendedAt, staffId: staff.id }
      : null;
  if (!scope || scope.suspended) return notFound();

  const { from, to } = feedWindow();
  const rows = await prisma.appointment.findMany({
    where: { businessId: scope.businessId, ...(scope.staffId ? { staffId: scope.staffId } : {}), status: { in: STATUSES }, date: { gte: from, lte: to } },
    orderBy: { date: "asc" },
    take: FEED_MAX_EVENTS,
    select: {
      id: true, date: true, estimatedAt: true, duration: true, status: true, notes: true, updatedAt: true, tokenNumber: true,
      client: { select: { name: true } }, service: { select: { name: true } }, staff: { select: { name: true } },
    },
  });
  const events: FeedEvent[] = rows.map((a) => ({
    id: a.id,
    start: a.tokenNumber && a.estimatedAt ? a.estimatedAt : a.date,
    durationMinutes: a.duration,
    summary: `${serviceLabel(a.service.name, a.notes)}: ${a.client.name}`,
    description: [a.staff?.name ? `With ${a.staff.name}` : null, a.tokenNumber ? `Token #${a.tokenNumber}` : null].filter(Boolean).join("\n") || undefined,
    cancelled: a.status === "cancelled" || a.status === "no-show",
    modified: a.updatedAt,
  }));
  return new NextResponse(buildFeed(scope.calName, events), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="calvy.ics"',
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex",
    },
  });
}

export const GET = safeRoute(GET_handler);
