import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { ClientDetailClient } from "./ClientDetailClient";

export const dynamic = 'force-dynamic';

export default async function ClientDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.businessId) redirect("/login");

  const client = await prisma.client.findUnique({
    where: { id: params.id },
    include: {
      appointments: {
        include: { service: true, staff: true },
        orderBy: { date: "desc" },
      },
    },
  });

  if (!client || client.businessId !== session.user.businessId) notFound();

  const data = {
    id: client.id,
    name: client.name,
    email: client.email ?? "",
    phone: client.phone ?? "",
    notes: client.notes ?? "",
    totalAppointments: client.totalAppointments,
    totalSpent: client.totalSpent,
    lastVisit: client.lastVisit ? new Date(client.lastVisit).toISOString().split("T")[0] : null,
    createdAt: new Date(client.createdAt).toISOString().split("T")[0],
    appointments: client.appointments.map(a => {
      let serviceName = a.service.name;
      if (a.notes?.startsWith("__services__:")) {
        const extra = a.notes.split("\n")[0].replace("__services__:", "").split("|").filter(Boolean);
        serviceName = [a.service.name, ...extra].join(" & ");
      }
      const d = new Date(a.date);
      return {
        id: a.id,
        date: d.toISOString().split("T")[0],
        time: `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`,
        serviceName,
        staffName: a.staff?.name ?? null,
        duration: a.duration,
        price: a.price,
        status: a.status,
        paymentStatus: a.paymentStatus,
        paymentMode: a.paymentMode,
      };
    }),
  };

  return <ClientDetailClient client={data} />;
}
