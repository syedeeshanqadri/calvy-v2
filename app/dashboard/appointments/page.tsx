import { safeTimeZone, utcToZoned } from "@/lib/time";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { AppointmentsClient } from "./AppointmentsClient";
import { getBusinessFeatures } from "@/lib/getFeatures";

export const dynamic = 'force-dynamic';

export default async function AppointmentsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.businessId) redirect("/login");
  const tz = safeTimeZone((await prisma.business.findUnique({ where: { id: session.user.businessId }, select: { timezone: true } }))?.timezone);

  const features = await getBusinessFeatures(session.user.businessId);

  const [appointments, services, staff] = await Promise.all([
    prisma.appointment.findMany({
      where: { businessId: session.user.businessId },
      include: { client: true, service: true, staff: true },
      orderBy: { date: "desc" },
    }),
    prisma.service.findMany({ where: { businessId: session.user.businessId, isActive: true } }),
    prisma.staff.findMany({ where: { businessId: session.user.businessId, isActive: true } }),
  ]);

  const rows = appointments.map(a => {
    // Multi-service bookings store extra names as "__services__:Name2|Name3\n..." prefix
    let serviceName = a.service.name;
    let notes: string | undefined = a.notes ?? undefined;
    if (a.notes?.startsWith("__services__:")) {
      const [prefixLine, ...rest] = a.notes.split("\n");
      const extraNames = prefixLine.replace("__services__:", "").split("|").filter(Boolean);
      serviceName = [a.service.name, ...extraNames].join(" & ");
      notes = rest.join("\n") || undefined;
    }
    return {
      id: a.id,
      clientName: a.client.name,
      clientEmail: a.client.email ?? a.client.phone ?? "",
      serviceName,
      staffId: a.staffId,
      staffName: a.staff?.name ?? "—",
      date: utcToZoned(a.date, tz).date,
      time: utcToZoned(a.date, tz).time,
      duration: a.duration,
      price: a.price,
      status: a.status,
      paymentStatus: a.paymentStatus,
      paymentMode: (a as { paymentMode?: string }).paymentMode ?? "postpaid",
      color: a.service.color,
      notes,
    };
  });

  return (
    <AppointmentsClient
      appointments={rows}
      services={services.map(s => ({ id: s.id, name: s.name, duration: s.duration, price: s.price }))}
      staff={staff.map(s => ({ id: s.id, name: s.name }))}
      csvExport={features.csvExport}
    />
  );
}
