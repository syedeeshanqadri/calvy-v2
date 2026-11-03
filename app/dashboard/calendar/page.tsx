import { safeTimeZone, utcToZoned } from "@/lib/time";
import { pageAccess, appointmentWhere } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { CalendarClient } from "./CalendarClient";
import { bookingForLabel } from "@/lib/patients";

export const dynamic = 'force-dynamic';

export default async function CalendarPage() {
  const session = await pageAccess(["calendar.manage", "appointments.view_all", "appointments.view_own"]);
  const tz = safeTimeZone((await prisma.business.findUnique({ where: { id: session.user.businessId }, select: { timezone: true } }))?.timezone);

  const now = new Date();
  const rangeStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 14);
  const rangeEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30);

  const [appointments, staff, services] = await Promise.all([
    prisma.appointment.findMany({
      where: { businessId: session.user.businessId, date: { gte: rangeStart, lte: rangeEnd }, status: { not: "expired" }, ...appointmentWhere(session.access) },
      include: { client: true, service: true, staff: true },
    }),
    prisma.staff.findMany({
      where: { businessId: session.user.businessId, isActive: true },
    }),
    prisma.service.findMany({ where: { businessId: session.user.businessId, isActive: true } }),
  ]);

  const apptRows = appointments.map(a => {
    // Multi-service bookings store extra names as "__services__:Name2|Name3\n..." prefix
    let serviceName = a.service.name;
    let notes: string | undefined = a.notes ?? undefined;
    if (a.notes?.startsWith("__services__:")) {
      const [prefixLine, ...rest] = a.notes.split("\n");
      const extra = prefixLine.replace("__services__:", "").split("|").filter(Boolean);
      serviceName = [a.service.name, ...extra].join(" & ");
      notes = rest.join("\n") || undefined;
    }
    const z = utcToZoned(a.date, tz);
    return {
      id: a.id,
      clientName: bookingForLabel(a),
      clientEmail: a.client.email ?? a.client.phone ?? "",
      serviceName,
      staffId: a.staffId,
      staffName: a.staff?.name ?? "—",
      date: z.date,
      time: z.time,
      duration: a.duration,
      price: a.price,
      status: a.status,
      paymentStatus: a.paymentStatus,
      paymentMode: (a as { paymentMode?: string }).paymentMode ?? "postpaid",
      color: a.service.color,
      tokenNumber: a.tokenNumber,
      notes,
    };
  });

  return (
    <CalendarClient
      appointments={apptRows}
      staff={staff.map(s => ({ id: s.id, name: s.name, color: s.color }))}
      services={services.map(s => ({ id: s.id, name: s.name, duration: s.duration, price: s.price, mode: s.mode }))}
    />
  );
}
