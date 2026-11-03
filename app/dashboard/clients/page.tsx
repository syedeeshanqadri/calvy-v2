import { pageAccess } from "@/lib/access";
import { getBusinessFeatures } from "@/lib/getFeatures";
import { getFlags } from "@/lib/flags";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { ClientsClient } from "./ClientsClient";

export const dynamic = 'force-dynamic';

export default async function ClientsPage() {
  const session = await pageAccess("customers.view");
  const perms = session.access.permissions;
  const features = await getBusinessFeatures(session.user.businessId);

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

  return (
    <ClientsClient
      clients={rows}
      canEdit={can(perms, "customers.edit")}
      canExport={can(perms, "customers.export")}
      csvExport={features.csvExport}
      upgradeHref={getFlags().payments ? "/dashboard/billing" : null}
    />
  );
}
