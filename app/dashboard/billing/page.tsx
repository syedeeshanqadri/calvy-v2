import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { trialDaysLeft, limitsFromConfig, PLAN_LIMITS, PLAN_META } from "@/lib/plans";
import { redirect, notFound } from "next/navigation";
import { getFlags } from "@/lib/flags";
import { displayPlan } from "@/lib/pricingDisplay";
import BillingClient from "./BillingClient";

export const dynamic = 'force-dynamic';

export type PlanData = {
  id: string;
  name: string;
  price: number;
  annualPrice: number;
  description: string;
  features: string[];
  highlight: boolean;
  maxStaff: number;
  maxServices: number;
  maxMonthlyAppointments: number;
  analytics: boolean;
  customBranding: boolean;
  chatbotWidget: boolean;
  groupBooking: boolean;
  stripePayments: boolean;
  emailReminders: boolean;
  whatsappReminders: boolean;
  broadcasts: boolean;
  csvExport: boolean;
  expenseTracking: boolean;
  wallet: boolean;
  customSlotInterval: boolean;
  removeBranding: boolean;
  prioritySupport: boolean;
};

// Free / Pro / Business are shown; the legacy "starter" plan stays in the database but is not offered.
const ORDER = ["free", "professional", "business"] as const;

/** Marketing name, prices and feature list come from lib/pricingDisplay.ts; limits and flags stay as loaded. */
function withDisplay(plans: PlanData[]): PlanData[] {
  return plans.map((p) => {
    const d = displayPlan(p.id);
    if (!d) return p;
    return {
      ...p,
      name: d.name,
      price: d.monthly,
      annualPrice: d.yearlyPerMonth,
      description: d.description,
      features: d.features,
      highlight: d.highlight,
    };
  });
}

async function getPlans(): Promise<PlanData[]> {
  return withDisplay(await loadPlans());
}

async function loadPlans(): Promise<PlanData[]> {
  const fallback = ORDER.map((planId) => {
    const meta = PLAN_META[planId];
    const limits = PLAN_LIMITS[planId];
    return {
      id: planId, name: meta.name, price: meta.price, annualPrice: meta.annualPrice,
      description: meta.description, features: [], highlight: planId === "professional",
      maxStaff: limits.maxStaff, maxServices: limits.maxServices,
      maxMonthlyAppointments: limits.maxMonthlyAppointments,
      analytics: limits.analytics, customBranding: limits.customBranding,
      chatbotWidget: limits.chatbotWidget, groupBooking: limits.groupBooking,
      stripePayments: limits.stripePayments, emailReminders: limits.emailReminders,
      whatsappReminders: limits.whatsappReminders, broadcasts: limits.broadcasts,
      csvExport: limits.csvExport, expenseTracking: limits.expenseTracking,
      wallet: limits.wallet, customSlotInterval: limits.customSlotInterval,
      removeBranding: limits.removeBranding, prioritySupport: limits.prioritySupport,
    };
  });

  try {
    const dbPlans = await prisma.planConfig.findMany();
    if (dbPlans.length === 0) return fallback;

    return ORDER.map((planId) => {
      const db = dbPlans.find(p => p.planId === planId) ?? null;
      const meta = PLAN_META[planId];
      // The database row is the truth; the code defaults only stand in for a row that does not exist yet.
      const limits = db ? limitsFromConfig(db) : PLAN_LIMITS[planId];
      let customFeatures: string[] = [];
      if (db?.features) { try { customFeatures = JSON.parse(db.features); } catch {} }
      return {
        id: planId,
        name: db?.name ?? meta.name,
        price: db?.price ?? meta.price,
        annualPrice: db?.annualPrice ?? meta.annualPrice,
        description: db?.description ?? meta.description,
        features: customFeatures,
        highlight: planId === "professional",
        ...limits,
      };
    });
  } catch {
    return fallback;
  }
}

export default async function BillingPage() {
  const flags = getFlags();
  if (!flags.payments) notFound();
  const session = await getServerSession(authOptions);
  if (!session?.user?.businessId) redirect("/login");

  const businessId = session.user.businessId;

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [business, monthlyAppointments, totalClients, totalServices, totalStaff, plans] = await Promise.all([
    prisma.business.findUnique({
      where: { id: businessId },
      select: { plan: true, planStatus: true, trialEndsAt: true, razorpaySubscriptionId: true },
    }),
    prisma.appointment.count({ where: { businessId, createdAt: { gte: monthStart } } }),
    prisma.client.count({ where: { businessId } }),
    prisma.service.count({ where: { businessId } }),
    prisma.staff.count({ where: { businessId } }),
    getPlans(),
  ]);

  if (!business) redirect("/login");

  return (
    <BillingClient
      currentPlan={business.plan}
      planStatus={business.planStatus}
      trialDaysLeft={trialDaysLeft(business.trialEndsAt)}
      razorpaySubscriptionId={business.razorpaySubscriptionId}
      monthlyAppointments={monthlyAppointments}
      totalClients={totalClients}
      totalServices={totalServices}
      totalStaff={totalStaff}
      plans={plans}
    />
  );
}
