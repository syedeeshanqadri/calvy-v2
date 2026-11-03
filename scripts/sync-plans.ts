// Upserts the Free / Pro (id "professional") / Business plan rows in PlanConfig so
// enforcement matches the pricing shown on the site (lib/plans.ts defaults).
// Idempotent. The legacy "starter" row is left alone.
//
//   npm run db:sync-plans        (loads .env.local; run on the DEV database only)
import { PrismaClient } from "@prisma/client";
import { PLAN_LIMITS, PLAN_META } from "../lib/plans";

const prisma = new PrismaClient();
const IDS = ["free", "professional", "business"] as const;

async function main() {
  const host = (process.env.DATABASE_URL ?? "").match(/@([^/:?]+)/)?.[1] ?? "unknown host";
  console.log(`Syncing plans on ${host}`);
  for (const id of IDS) {
    const l = PLAN_LIMITS[id];
    const m = PLAN_META[id];
    const data = {
      name: m.name,
      price: m.price,
      annualPrice: m.annualPrice,
      description: m.description,
      maxStaff: l.maxStaff,
      maxServices: l.maxServices,
      maxMonthlyAppointments: l.maxMonthlyAppointments,
      maxBroadcastsPerMonth: l.maxBroadcastsPerMonth,
      maxTeamMembers: l.maxTeamMembers,
      analytics: l.analytics,
      customBranding: l.customBranding,
      imageUpload: l.imageUpload,
      seoControls: l.seoControls,
      chatbotWidget: l.chatbotWidget,
      groupBooking: l.groupBooking,
      multiService: l.multiService,
      stripePayments: l.stripePayments,
      emailReminders: l.emailReminders,
      smsReminders: l.whatsappReminders,
      broadcasts: l.broadcasts,
      csvExport: l.csvExport,
      expenseTracking: l.expenseTracking,
      wallet: l.wallet,
      customSlotInterval: l.customSlotInterval,
      removeBranding: l.removeBranding,
      prioritySupport: l.prioritySupport,
      features: "[]", // marketing bullets live in lib/pricingDisplay.ts
    };
    await prisma.planConfig.upsert({ where: { planId: id }, create: { planId: id, ...data }, update: data });
    console.log(`  ${id}: staff ${l.maxStaff}, appointments/month ${l.maxMonthlyAppointments}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
