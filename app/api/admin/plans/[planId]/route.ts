import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

function isAdmin(session: Awaited<ReturnType<typeof getServerSession>> & { user?: { role?: string; email?: string | null } } | null) {
  return session?.user?.role === "admin" || session?.user?.email === process.env.SUPER_ADMIN_EMAIL;
}

export async function PATCH(req: NextRequest, { params }: { params: { planId: string } }) {
  const session = await getServerSession(authOptions) as Awaited<ReturnType<typeof getServerSession>> & { user?: { role?: string; email?: string | null } } | null;
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const {
    name, price, annualPrice, description,
    maxStaff, maxServices, maxMonthlyAppointments, maxBroadcastsPerMonth,
    analytics, customBranding, imageUpload, seoControls, chatbotWidget,
    groupBooking, multiService, stripePayments, emailReminders, smsReminders,
    broadcasts, csvExport, expenseTracking, wallet, customSlotInterval,
    removeBranding, prioritySupport,
    features,
  } = body;

  if (price !== undefined && Number(price) < 0) {
    return NextResponse.json({ error: "Price cannot be negative" }, { status: 400 });
  }
  if (annualPrice !== undefined && Number(annualPrice) < 0) {
    return NextResponse.json({ error: "Annual price cannot be negative" }, { status: 400 });
  }
  for (const field of ["maxStaff", "maxServices", "maxMonthlyAppointments", "maxBroadcastsPerMonth"] as const) {
    const val = body[field];
    if (val !== undefined && Number(val) < -1) {
      return NextResponse.json({ error: `${field} must be -1 (unlimited) or a positive number` }, { status: 400 });
    }
  }

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
