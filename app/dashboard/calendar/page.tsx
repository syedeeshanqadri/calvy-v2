import { safeTimeZone, utcToZoned } from "@/lib/time";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { CalendarClient } from "./CalendarClient";

export const dynamic = 'force-dynamic';

export default async function CalendarPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.businessId) redirect("/login");
  const tz = safeTimeZone((await prisma.business.findUnique({ where: { id: session.user.businessId }, select: { timezone: true } }))?.timezone);

  const now = new Date();
  const rangeStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 14);
  const rangeEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30);

  const [appointments, staff] = await Promise.all([
    prisma.appointment.findMany({
      where: { businessId: session.user.businessId, date: { gte: rangeStart, lte: rangeEnd } },
      include: { client: true, service: true },
    }),
    prisma.staff.findMany({
      where: { businessId: session.user.businessId, isActive: true },
    }),
  ]);

  const apptRows = appointments.map(a => {
    let serviceName = a.service.name;
    if (a.notes?.startsWith("__services__:")) {
      const extra = a.notes.split("\n")[0].replace("__services__:", "").split("|").filter(Boolean);
      serviceName = [a.service.name, ...extra].join(" & ");
    }
    return {
      id: a.id,
      clientName: a.client.name,
      serviceName,
      date: utcToZoned(a.date, tz).date,
      time: utcToZoned(a.date, tz).time,
      duration: a.duration,
      color: a.service.color,
      status: a.status,
    };
  });

  const staffRows = staff.map(s => ({ id: s.id, name: s.name, color: s.color }));

  return <CalendarClient appointments={apptRows} staff={staffRows} />;
}
