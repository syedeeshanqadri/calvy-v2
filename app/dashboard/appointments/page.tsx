import { getBusinessCore } from "@/lib/requestCache";
import { appointmentRowSelect, toAppointmentRow } from "@/lib/appointmentRows";
import { safeTimeZone } from "@/lib/time";
import { pageAccess, appointmentWhere } from "@/lib/access";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getFlags } from "@/lib/flags";
import { AppointmentsClient } from "./AppointmentsClient";
import { getBusinessFeatures } from "@/lib/getFeatures";

export const dynamic = 'force-dynamic';

export default async function AppointmentsPage() {
  const session = await pageAccess(["appointments.view_all", "appointments.view_own"]);
  const biz = await getBusinessCore(session.user.businessId);
  const tz = safeTimeZone(biz?.timezone);

  const features = await getBusinessFeatures(session.user.businessId);

  // Only the recent window loads here: the last 60 days and everything upcoming (capped). Older history comes a page at a time (/api/appointments/history).
  const now = new Date();
  const windowStart = new Date(now.getTime() - 60 * 86_400_000);
  const base = { businessId: session.user.businessId, status: { not: "expired" }, ...appointmentWhere(session.access) };
  const [appointments, services, staff, olderCount] = await Promise.all([
    prisma.appointment.findMany({
      // Lapsed online-payment holds are noise for the owner.
      where: { ...base, date: { gte: windowStart } },
      select: appointmentRowSelect,
      orderBy: { date: "desc" },
      take: 1000,
    }),
    prisma.service.findMany({ where: { businessId: session.user.businessId, isActive: true }, select: { id: true, name: true, duration: true, price: true, mode: true } }),
    prisma.staff.findMany({ where: { businessId: session.user.businessId, isActive: true }, select: { id: true, name: true } }),
    prisma.appointment.count({ where: { ...base, date: { lt: windowStart } } }),
  ]);

  const rows = appointments.map((a) => toAppointmentRow(a, tz));

  return (
    <AppointmentsClient
      appointments={rows}
      olderCount={olderCount}
      windowStartIso={windowStart.toISOString()}
      services={services.map(s => ({ id: s.id, name: s.name, duration: s.duration, price: s.price, mode: s.mode }))}
      staff={staff.map(s => ({ id: s.id, name: s.name }))}
      clinicRecords={biz?.packId === "CLINIC"}
      csvExport={features.csvExport}
      canExport={can(session.access.permissions, "reports.view")}
      canWrite={can(session.access.permissions, "appointments.write")}
      canCancel={can(session.access.permissions, "appointments.cancel")}
      upgradeHref={getFlags().payments ? "/dashboard/billing" : null}
    />
  );
}
