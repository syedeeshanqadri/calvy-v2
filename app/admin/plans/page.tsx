import { getServerSession } from "next-auth";
import { isAdminUser } from "@/lib/adminAuth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { ensureSeededPlans, PLAN_IDS } from "@/lib/planConfigDb";
import { PlansClient } from "./PlansClient";

export const dynamic = 'force-dynamic';

export default async function AdminPlansPage() {
  const session = await getServerSession(authOptions);
  const isAdmin = isAdminUser(session?.user);
  if (!isAdmin) redirect("/login");

  const [plans, planCounts] = await Promise.all([
    ensureSeededPlans(),
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
