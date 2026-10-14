import { prisma } from "@/lib/prisma";
import { PLAN_LIMITS, PLAN_META } from "@/lib/plans";
import PricingClient from "./PricingClient";

export interface PlanDisplay {
  id: string;
  name: string;
  price: number;
  annualPrice: number;
  description: string;
  features: string[];
  highlight: boolean;
  badge?: string;
  href: string;
  cta: string;
  isFree: boolean;
}

type DbPlan = Awaited<ReturnType<typeof prisma.planConfig.findMany>>[number];

function buildFeatureList(db: DbPlan | null, fallback: typeof PLAN_LIMITS[keyof typeof PLAN_LIMITS]): string[] {
  const maxStaff = db?.maxStaff ?? fallback.maxStaff;
  const maxServices = db?.maxServices ?? fallback.maxServices;
  const maxAppts = db?.maxMonthlyAppointments ?? fallback.maxMonthlyAppointments;
  const maxBroadcasts = (db as DbPlan & { maxBroadcastsPerMonth?: number } | null)?.maxBroadcastsPerMonth ?? 0;

  const feats: string[] = [
    maxStaff === -1 ? "Unlimited staff" : `${maxStaff} staff member${maxStaff !== 1 ? "s" : ""}`,
    maxServices === -1 ? "Unlimited services" : `${maxServices} services`,
    maxAppts === -1 ? "Unlimited bookings/month" : `${maxAppts} bookings/month`,
    "Booking page & public website",
    "Email confirmations + calendar invite",
  ];

  const flag = (dbKey: keyof DbPlan, fallbackKey: keyof typeof fallback, label: string) => {
    const val = db ? db[dbKey] : fallback[fallbackKey as keyof typeof fallback];
    if (val) feats.push(label);
  };

  flag("emailReminders",   "emailReminders",    "Email reminders (24h before)");
  flag("customBranding",   "customBranding",    "Custom branding & colors");
  flag("imageUpload",      "imageUpload",       "Image upload for website");
  flag("seoControls",      "seoControls",       "SEO controls");
  flag("customSlotInterval","customSlotInterval","Custom slot intervals");
  flag("csvExport",        "csvExport",         "CSV export");
  flag("expenseTracking",  "expenseTracking",   "Expense tracking");
  flag("chatbotWidget",    "chatbotWidget",     "Chatbot booking widget");
  flag("groupBooking",     "groupBooking",      "Group booking");
  flag("stripePayments",   "stripePayments",    "Online payments (Razorpay)");
  flag("smsReminders",     "whatsappReminders", "WhatsApp confirmations & reminders");
  flag("broadcasts",       "broadcasts",        maxBroadcasts === -1 ? "Unlimited client broadcasts" : maxBroadcasts > 0 ? `${maxBroadcasts} broadcasts/month` : "Client broadcasts");
  flag("analytics",        "analytics",         "Analytics dashboard");
  flag("wallet",           "wallet",            "Wallet & withdrawals");
  flag("removeBranding",   "removeBranding",    "Remove \"Powered by Calvy\"");
  flag("prioritySupport",  "prioritySupport",   "Priority support");

  return feats;
}

async function getPlans(): Promise<PlanDisplay[]> {
  const ORDER = ["free", "starter", "professional", "business"] as const;
  try {
    const dbPlans = await prisma.planConfig.findMany();
    if (dbPlans.length === 0) throw new Error("no plans");

    return ORDER.map((planId) => {
      const db = dbPlans.find(p => p.planId === planId) ?? null;
      const meta = PLAN_META[planId];
      const limits = PLAN_LIMITS[planId];

      // Custom bullet-point overrides from admin (freeform features field)
      let customFeatures: string[] = [];
      if (db?.features) { try { customFeatures = JSON.parse(db.features); } catch {} }

      const features = customFeatures.length ? customFeatures : buildFeatureList(db, limits);
      const dbAny = db as (DbPlan & { annualPrice?: number }) | null;

      return {
        id: planId,
        name: db?.name ?? meta.name,
        price: db?.price ?? meta.price,
        annualPrice: dbAny?.annualPrice ?? meta.annualPrice,
        description: db?.description ?? meta.description,
        features,
        highlight: planId === "professional",
        badge: planId === "professional" ? "Most popular" : undefined,
        href: "/signup",
        cta: planId === "free" ? "Get started free" : planId === "business" ? "Get started" : "Start free",
        isFree: planId === "free",
      };
    });
  } catch {
    return ORDER.map((planId) => {
      const meta = PLAN_META[planId];
      const limits = PLAN_LIMITS[planId];
      return {
        id: planId,
        name: meta.name,
        price: meta.price,
        annualPrice: meta.annualPrice,
        description: meta.description,
        features: buildFeatureList(null, limits),
        highlight: planId === "professional",
        badge: planId === "professional" ? "Most popular" : undefined,
        href: "/signup",
        cta: planId === "free" ? "Get started free" : planId === "business" ? "Get started" : "Start free",
        isFree: planId === "free",
      };
    });
  }
}

export async function Pricing() {
  // Subscription (platform fee) is always shown in USD.
  const plans = await getPlans();
  return <PricingClient plans={plans} />;
}
