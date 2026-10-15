import { getServerSession } from "next-auth";
import { isAdminUser } from "@/lib/adminAuth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { TenantsClient } from "./TenantsClient";

export const dynamic = 'force-dynamic';

export default async function AdminTenantsPage() {
  const session = await getServerSession(authOptions);
  const isAdmin = isAdminUser(session?.user);
  if (!isAdmin) redirect("/login");

  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

  const tenants = await prisma.business.findMany({
    include: {
      owner: { select: { name: true, email: true } },
      _count: { select: { appointments: true, clients: true, staff: true, services: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const monthlyData = await prisma.appointment.groupBy({
    by: ["businessId"],
    where: { createdAt: { gte: monthStart } },
    _count: { id: true },
    _sum: { price: true },
  });
  const mm = new Map(monthlyData.map(d => [d.businessId, { count: d._count.id, revenue: d._sum.price ?? 0 }]));

  return (
    <TenantsClient
      initialTenants={tenants.map(t => ({
        id: t.id, name: t.name, slug: t.slug, plan: t.plan, planStatus: t.planStatus,
        trialEndsAt: t.trialEndsAt?.toISOString() ?? null,
        currency: t.currency, businessType: t.businessType, email: t.email,
        createdAt: t.createdAt.toISOString(),
        owner: t.owner,
        counts: t._count,
        monthly: mm.get(t.id) ?? { count: 0, revenue: 0 },
      }))}
    />
  );
}
