import { getServerSession } from "next-auth";
import { isAdminUser } from "@/lib/adminAuth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { PLAN_LIMITS, PLAN_META } from "@/lib/plans";
import { PlansClient } from "./PlansClient";

export const dynamic = 'force-dynamic';

const PLAN_IDS = ["free", "starter", "professional", "business"] as const;

async function getOrSeedPlans() {
  const existing = await prisma.planConfig.findMany();
  const existingIds = new Set(existing.map(p => p.planId));
  const toCreate = PLAN_IDS.filter(id => !existingIds.has(id));

  if (toCreate.length > 0) {
    await Promise.all(toCreate.map(planId =>
      prisma.planConfig.create({
        data: {
          planId,
          name: PLAN_META[planId].name,
          price: PLAN_META[planId].price,
          annualPrice: PLAN_META[planId].annualPrice,
          description: PLAN_META[planId].description,
          maxStaff: PLAN_LIMITS[planId].maxStaff,
          maxServices: PLAN_LIMITS[planId].maxServices,
          maxMonthlyAppointments: PLAN_LIMITS[planId].maxMonthlyAppointments,
          maxBroadcastsPerMonth: PLAN_LIMITS[planId].maxBroadcastsPerMonth,
          platformFeeMinorIN: PLAN_LIMITS[planId].platformFeeMinorIN,
          analytics: PLAN_LIMITS[planId].analytics,
          customBranding: PLAN_LIMITS[planId].customBranding,
          imageUpload: PLAN_LIMITS[planId].imageUpload,
          seoControls: PLAN_LIMITS[planId].seoControls,
          chatbotWidget: PLAN_LIMITS[planId].chatbotWidget,
          groupBooking: PLAN_LIMITS[planId].groupBooking,
          multiService: PLAN_LIMITS[planId].multiService,
          stripePayments: PLAN_LIMITS[planId].stripePayments,
          emailReminders: PLAN_LIMITS[planId].emailReminders,
          smsReminders: PLAN_LIMITS[planId].whatsappReminders,
          broadcasts: PLAN_LIMITS[planId].broadcasts,
          csvExport: PLAN_LIMITS[planId].csvExport,
          expenseTracking: PLAN_LIMITS[planId].expenseTracking,
          wallet: PLAN_LIMITS[planId].wallet,
          customSlotInterval: PLAN_LIMITS[planId].customSlotInterval,
          removeBranding: PLAN_LIMITS[planId].removeBranding,
          prioritySupport: PLAN_LIMITS[planId].prioritySupport,
          features: "[]",
        },
      })
    ));
    return prisma.planConfig.findMany({ orderBy: { planId: "asc" } });
  }
  return existing;
}

export default async function AdminPlansPage() {
  const session = await getServerSession(authOptions);
  const isAdmin = isAdminUser(session?.user);
  if (!isAdmin) redirect("/login");

  const [plans, planCounts] = await Promise.all([
    getOrSeedPlans(),
    prisma.business.groupBy({ by: ["plan"], _count: { id: true } }),
  ]);

  const orderedPlans = PLAN_IDS.map(id => plans.find(p => p.planId === id)!).filter(Boolean);

  const tenantCounts = Object.fromEntries(planCounts.map(p => [p.plan, p._count.id]));

  const envConfigured = {
    starter: !!process.env.RAZORPAY_PLAN_STARTER?.startsWith("plan_"),
    professional: !!process.env.RAZORPAY_PLAN_PROFESSIONAL?.startsWith("plan_"),
    business: !!process.env.RAZORPAY_PLAN_BUSINESS?.startsWith("plan_"),
  };

  return (
    <PlansClient
      plans={orderedPlans.map(p => ({ ...p, features: p.features ?? "[]" }))}
      tenantCounts={tenantCounts}
      envConfigured={envConfigured}
    />
  );
}
