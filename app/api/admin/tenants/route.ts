import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { isAdminUser } from "@/lib/adminAuth";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import { parseQuery } from "@/lib/validation/common";
import { adminPageQuery } from "@/lib/validation/admin";

export const dynamic = 'force-dynamic';

function isAdmin(session: Awaited<ReturnType<typeof getServerSession>> & { user?: { role?: string; email?: string | null } } | null) {
  return isAdminUser(session?.user);
}

async function GET_handler(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const q = parseQuery(req.url, adminPageQuery);
  if (!q.ok) return q.res;
  const { page, limit } = q.data;

  const tenants = await prisma.business.findMany({
    include: {
      owner: { select: { id: true, name: true, email: true, role: true, createdAt: true } },
      _count: { select: { appointments: true, clients: true, staff: true, services: true } },
    },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * limit,
    take: limit,
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

export const GET = safeRoute(GET_handler);
