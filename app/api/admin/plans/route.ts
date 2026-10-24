import { safeRoute } from "@/lib/api";
import { NextResponse } from "next/server";
import { isAdminUser } from "@/lib/adminAuth";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PLAN_LIMITS, PLAN_META } from "@/lib/plans";

export const dynamic = 'force-dynamic';

function isAdmin(session: Awaited<ReturnType<typeof getServerSession>> & { user?: { role?: string; email?: string | null } } | null) {
  return isAdminUser(session?.user);
}

const PLAN_IDS = ["free", "starter", "professional", "business"] as const;

// Seed defaults if not in DB yet
async function ensureSeeded() {
  const existing = await prisma.planConfig.findMany();
  const existingIds = new Set(existing.map(p => p.planId));
  const toCreate = PLAN_IDS.filter(id => !existingIds.has(id));
  if (toCreate.length === 0) return existing;

  await Promise.all(toCreate.map(planId =>
    prisma.planConfig.create({
      data: {
        planId,
        name: PLAN_META[planId].name,
        price: PLAN_META[planId].price,
        description: PLAN_META[planId].description,
        maxStaff: PLAN_LIMITS[planId].maxStaff,
        maxServices: PLAN_LIMITS[planId].maxServices,
        maxMonthlyAppointments: PLAN_LIMITS[planId].maxMonthlyAppointments,
        analytics: PLAN_LIMITS[planId].analytics,
        customBranding: PLAN_LIMITS[planId].customBranding,
        smsReminders: PLAN_LIMITS[planId].whatsappReminders,
        stripePayments: PLAN_LIMITS[planId].stripePayments,
        prioritySupport: PLAN_LIMITS[planId].prioritySupport,
        features: "[]",
      },
    })
  ));

  return prisma.planConfig.findMany();
}

async function GET_handler() {
  const session = await getServerSession(authOptions) as Awaited<ReturnType<typeof getServerSession>> & { user?: { role?: string; email?: string | null } } | null;
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const plans = await ensureSeeded();
  return NextResponse.json(plans);
}

export const GET = safeRoute(GET_handler);
