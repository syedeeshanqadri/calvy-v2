import { prisma } from "@/lib/prisma";
import { appointmentWhere, type Access } from "@/lib/access";
import { can } from "@/lib/permissions";
import { shortName } from "@/lib/pushRouting";
import { formatTimeLabel, safeTimeZone, utcToZoned, zonedDayRange } from "@/lib/time";

export interface TodayRow {
  id: string;
  timeLabel: string;
  /** "Riya K." : first name and an initial. */
  name: string;
  service: string;
  status: string;
  isToken: boolean;
  tokenNumber: number | null;
  queueState: string | null;
  tokenSessionId: string | null;
  sessionDate: string | null;
  arrivedAt: string | null;
  /** Only for people who may see customer details: tel: and WhatsApp links. */
  phone: string | null;
}

export interface TodayData {
  rows: TodayRow[];
  isTokenBusiness: boolean;
  date: string;
  can: { write: boolean; queue: boolean; callCustomers: boolean; viewAny: boolean };
}

/** Today's appointments for the signed-in person, scoped to what their access allows (own-only members see their own). */
export async function loadToday(access: Access, now = new Date()): Promise<TodayData> {
  const perms = access.permissions;
  const caps = {
    write: access.isOwner || can(perms, "appointments.write"),
    queue: access.isOwner || can(perms, "queue.control"),
    callCustomers: access.isOwner || can(perms, "customers.view"),
    viewAny: access.isOwner || can(perms, ["appointments.view_all", "appointments.view_own", "queue.control"]),
  };
  const biz = await prisma.business.findUnique({ where: { id: access.businessId }, select: { timezone: true, bookingMode: true } });
  const tz = safeTimeZone(biz?.timezone);
  const date = utcToZoned(now, tz).date;
  const empty: TodayData = { rows: [], isTokenBusiness: biz?.bookingMode === "TOKEN", date, can: caps };
  if (!caps.viewAny) return empty;

  const { start, end } = zonedDayRange(date, tz);
  // A queue-only member sees the day's tokens (what the queue screen shows them); everyone else is scoped like the appointments list.
  const hasAppointments = access.isOwner || can(perms, ["appointments.view_all", "appointments.view_own"]);
  const scope = hasAppointments ? appointmentWhere(access) : { tokenNumber: { not: null } };
  const rows = await prisma.appointment.findMany({
    where: { businessId: access.businessId, ...scope, status: { in: ["confirmed", "pending", "completed", "no-show"] }, OR: [{ date: { gte: start, lt: end } }, { sessionDate: new Date(`${date}T00:00:00Z`) }] },
    orderBy: [{ tokenNumber: "asc" }, { date: "asc" }],
    take: 60,
    select: {
      id: true, date: true, estimatedAt: true, status: true, patientName: true, tokenNumber: true, queueState: true, tokenSessionId: true, arrivedAt: true,
      service: { select: { name: true } }, client: { select: { name: true, phone: true } },
    },
  });
  return {
    ...empty,
    rows: rows.map((a) => ({
      id: a.id,
      timeLabel: formatTimeLabel(a.tokenNumber ? a.estimatedAt ?? a.date : a.date, tz),
      name: shortName(a.patientName?.trim() || a.client.name),
      service: a.service.name,
      status: a.status,
      isToken: a.tokenNumber !== null,
      tokenNumber: a.tokenNumber,
      queueState: a.queueState,
      tokenSessionId: a.tokenSessionId,
      sessionDate: a.tokenNumber !== null ? date : null,
      arrivedAt: a.arrivedAt?.toISOString() ?? null,
      phone: caps.callCustomers ? a.client.phone ?? null : null,
    })),
  };
}
