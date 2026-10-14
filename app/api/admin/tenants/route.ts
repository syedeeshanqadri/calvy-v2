import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

function isAdmin(session: Awaited<ReturnType<typeof getServerSession>> & { user?: { role?: string; email?: string | null } } | null) {
  return session?.user?.role === "admin" || session?.user?.email === process.env.SUPER_ADMIN_EMAIL;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const tenants = await prisma.business.findMany({
    include: {
      owner: { select: { id: true, name: true, email: true, role: true, createdAt: true } },
      _count: { select: { appointments: true, clients: true, staff: true, services: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const monthlyData = await prisma.appointment.groupBy({
    by: ["businessId"],
    where: { createdAt: { gte: monthStart } },
    _count: { id: true },
    _sum: { price: true },
  });

  const monthlyMap = new Map(monthlyData.map((d) => [d.businessId, { count: d._count.id, revenue: d._sum.price ?? 0 }]));

  return NextResponse.json({
    tenants: tenants.map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      plan: t.plan,
      planStatus: t.planStatus,
      trialEndsAt: t.trialEndsAt,
      currency: t.currency,
      businessType: t.businessType,
      email: t.email,
      createdAt: t.createdAt,
      owner: t.owner,
      counts: t._count,
      monthly: monthlyMap.get(t.id) ?? { count: 0, revenue: 0 },
    })),
  });
}
