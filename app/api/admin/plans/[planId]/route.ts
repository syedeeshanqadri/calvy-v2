import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { isAdminUser } from "@/lib/adminAuth";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import { parseBody } from "@/lib/validation/common";
import { planPatchSchema } from "@/lib/validation/admin";

export const dynamic = 'force-dynamic';

function isAdmin(session: Awaited<ReturnType<typeof getServerSession>> & { user?: { role?: string; email?: string | null } } | null) {
  return isAdminUser(session?.user);
}

async function PATCH_handler(req: NextRequest, props: { params: Promise<{ planId: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions) as Awaited<ReturnType<typeof getServerSession>> & { user?: { role?: string; email?: string | null } } | null;
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = await parseBody(req, planPatchSchema);
  if (!parsed.ok) return parsed.res;
  const {
    name, price, annualPrice, description,
    maxStaff, maxServices, maxMonthlyAppointments, maxBroadcastsPerMonth, platformFeeMinorIN,
    analytics, customBranding, imageUpload, seoControls, chatbotWidget,
    groupBooking, multiService, stripePayments, emailReminders, smsReminders,
    broadcasts, csvExport, expenseTracking, wallet, customSlotInterval,
    removeBranding, prioritySupport,
    features,
  } = parsed.data;

  const updated = await prisma.planConfig.update({
    where: { planId: params.planId },
    data: {
      ...(name !== undefined && { name }),
      ...(price !== undefined && { price: Number(price) }),
      ...(annualPrice !== undefined && { annualPrice: Number(annualPrice) }),
      ...(description !== undefined && { description }),
      ...(maxStaff !== undefined && { maxStaff: Number(maxStaff) }),
      ...(maxServices !== undefined && { maxServices: Number(maxServices) }),
      ...(maxMonthlyAppointments !== undefined && { maxMonthlyAppointments: Number(maxMonthlyAppointments) }),
      ...(maxBroadcastsPerMonth !== undefined && { maxBroadcastsPerMonth: Number(maxBroadcastsPerMonth) }),
      ...(platformFeeMinorIN !== undefined && { platformFeeMinorIN: Number(platformFeeMinorIN) }),
      ...(analytics !== undefined && { analytics: Boolean(analytics) }),
      ...(customBranding !== undefined && { customBranding: Boolean(customBranding) }),
      ...(imageUpload !== undefined && { imageUpload: Boolean(imageUpload) }),
      ...(seoControls !== undefined && { seoControls: Boolean(seoControls) }),
      ...(chatbotWidget !== undefined && { chatbotWidget: Boolean(chatbotWidget) }),
      ...(groupBooking !== undefined && { groupBooking: Boolean(groupBooking) }),
      ...(multiService !== undefined && { multiService: Boolean(multiService) }),
      ...(stripePayments !== undefined && { stripePayments: Boolean(stripePayments) }),
      ...(emailReminders !== undefined && { emailReminders: Boolean(emailReminders) }),
      ...(smsReminders !== undefined && { smsReminders: Boolean(smsReminders) }),
      ...(broadcasts !== undefined && { broadcasts: Boolean(broadcasts) }),
      ...(csvExport !== undefined && { csvExport: Boolean(csvExport) }),
      ...(expenseTracking !== undefined && { expenseTracking: Boolean(expenseTracking) }),
      ...(wallet !== undefined && { wallet: Boolean(wallet) }),
      ...(customSlotInterval !== undefined && { customSlotInterval: Boolean(customSlotInterval) }),
      ...(removeBranding !== undefined && { removeBranding: Boolean(removeBranding) }),
      ...(prioritySupport !== undefined && { prioritySupport: Boolean(prioritySupport) }),
      ...(features !== undefined && { features: JSON.stringify(features) }),
    },
  });

  return NextResponse.json(updated);
}

export const PATCH = safeRoute(PATCH_handler);
