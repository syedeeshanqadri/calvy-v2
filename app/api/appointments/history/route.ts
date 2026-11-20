import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { accessSession, appointmentWhere } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { parseQuery } from "@/lib/validation/common";
import { safeTimeZone } from "@/lib/time";
import { appointmentRowSelect, toAppointmentRow } from "@/lib/appointmentRows";

export const dynamic = "force-dynamic";

const PAGE = 50;
const query = z.object({
  before: z.string().datetime().optional(),
  id: z.string().min(1).max(64).optional(),
  q: z.string().trim().max(80).optional(),
});

/**
 * Older appointments for the list, one page at a time (the page itself loads only the recent window), or a single appointment by id
 * (a phone alert can point at an old booking). Same permission and scope rules as the list: a member sees only what their role allows.
 */
async function GET_handler(request: NextRequest) {
  const session = await accessSession(["appointments.view_all", "appointments.view_own"]);
  const businessId = session?.user?.businessId;
  if (!session || !businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = parseQuery(request.url, query);
  if (!parsed.ok) return parsed.res;
  const { before, id, q } = parsed.data;

  const biz = await prisma.business.findUnique({ where: { id: businessId }, select: { timezone: true } });
  const tz = safeTimeZone(biz?.timezone);
  const where = {
    businessId, status: { not: "expired" }, ...appointmentWhere(session.access),
    ...(id ? { id } : {}),
    ...(before ? { date: { lt: new Date(before) } } : {}),
    ...(q ? { OR: [{ patientName: { contains: q, mode: "insensitive" as const } }, { client: { name: { contains: q, mode: "insensitive" as const } } }, { service: { name: { contains: q, mode: "insensitive" as const } } }] } : {}),
  };
  const rows = await prisma.appointment.findMany({ where, select: appointmentRowSelect, orderBy: { date: "desc" }, take: id ? 1 : PAGE + 1 });
  const hasMore = !id && rows.length > PAGE;
  const page = rows.slice(0, PAGE);
  return NextResponse.json({ rows: page.map((a) => toAppointmentRow(a, tz)), hasMore, nextBefore: page.length ? page[page.length - 1].date.toISOString() : null });
}

export const GET = safeRoute(GET_handler);
