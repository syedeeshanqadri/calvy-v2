import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { ClientsClient } from "./ClientsClient";

export const dynamic = 'force-dynamic';

export default async function ClientsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.businessId) redirect("/login");

  const clients = await prisma.client.findMany({
    where: { businessId: session.user.businessId },
    orderBy: { totalSpent: "desc" },
  });

  const rows = clients.map(c => ({
    id: c.id,
    name: c.name,
    email: c.email ?? "",
    phone: c.phone ?? "",
    totalAppointments: c.totalAppointments,
    totalSpent: c.totalSpent,
    lastVisit: c.lastVisit ? new Date(c.lastVisit).toISOString().split("T")[0] : null,
    notes: c.notes ?? "",
  }));

  return <ClientsClient clients={rows} />;
}
