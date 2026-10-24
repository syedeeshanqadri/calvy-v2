import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseBody, parseQuery } from "@/lib/validation/common";
import { timeOffCreateSchema, timeOffListQuery } from "@/lib/validation/timeoff";
import { addDays, safeTimeZone, utcToZoned, zonedDayRange, zonedTimeToUtc } from "@/lib/time";

export const dynamic = "force-dynamic";

const MAX_SPAN_DAYS = 366;

async function GET_handler(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const businessId = session?.user?.businessId;
  if (!businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = parseQuery(request.url, timeOffListQuery);
  if (!q.ok) return q.res;
  const biz = await prisma.business.findUnique({ where: { id: businessId }, select: { timezone: true } });
  const tz = safeTimeZone(biz?.timezone);
  // Default: everything that has not ended yet.
  const from = q.data.from ? zonedDayRange(q.data.from, tz).start : new Date();

  const rows = await prisma.timeOff.findMany({
    where: { businessId, endAt: { gt: from }, ...(q.data.staffId ? { staffId: q.data.staffId } : {}) },
    include: { staff: { select: { name: true } } },
    orderBy: { startAt: "asc" },
    take: 500,
  });
  return NextResponse.json({
    timeOff: rows.map((r) => ({
      id: r.id,
      staffId: r.staffId,
      staffName: r.staff?.name ?? null,
      reason: r.reason,
      startAt: r.startAt.toISOString(),
      endAt: r.endAt.toISOString(),
      start: utcToZoned(r.startAt, tz),
      end: utcToZoned(r.endAt, tz),
    })),
  });
}

async function POST_handler(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const businessId = session?.user?.businessId;
  if (!businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = await parseBody(request, timeOffCreateSchema);
  if (!parsed.ok) return parsed.res;
  const { staffId, startDate, endDate, startTime, endTime, reason } = parsed.data;

  const biz = await prisma.business.findUnique({ where: { id: businessId }, select: { timezone: true } });
  const tz = safeTimeZone(biz?.timezone);

  // Tenant isolation: a staff member must belong to this business.
  if (staffId) {
    const ok = await prisma.staff.findFirst({ where: { id: staffId, businessId }, select: { id: true } });
    if (!ok) return NextResponse.json({ error: "Staff member not found." }, { status: 404 });
  }

  const lastDay = endDate ?? startDate;
  const startAt = startTime ? zonedTimeToUtc(startDate, startTime, tz) : zonedDayRange(startDate, tz).start;
  const endAt = endTime ? zonedTimeToUtc(lastDay, endTime, tz) : zonedDayRange(lastDay, tz).end;
  if (isNaN(startAt.getTime()) || isNaN(endAt.getTime()) || endAt <= startAt) {
    return NextResponse.json({ error: "The end must be after the start." }, { status: 400 });
  }
  if (lastDay > addDays(startDate, MAX_SPAN_DAYS)) {
    return NextResponse.json({ error: `Time off can span at most ${MAX_SPAN_DAYS} days.` }, { status: 400 });
  }

  const created = await prisma.timeOff.create({
    data: { businessId, staffId: staffId || null, startAt, endAt, reason: reason ?? "" },
  });
  return NextResponse.json({ timeOff: created }, { status: 201 });
}

export const GET = safeRoute(GET_handler);
export const POST = safeRoute(POST_handler);
