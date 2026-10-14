import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLimits, isActivePlan } from "@/lib/plans";

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const staff = await prisma.staff.findMany({
    where: { businessId: session.user.businessId },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ staff });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { name, role, email, phone, color } = body;

  if (!name || !role || !email) {
    return NextResponse.json({ error: "Name, role, and email are required" }, { status: 400 });
  }

  const business = await prisma.business.findUnique({
    where: { id: session.user.businessId },
    select: { plan: true, planStatus: true, trialEndsAt: true },
  });
  if (!business || !isActivePlan(business.planStatus, business.plan, business.trialEndsAt)) {
    return NextResponse.json({ error: "Your trial has expired. Please upgrade to continue.", code: "PLAN_EXPIRED" }, { status: 402 });
  }
  const limits = getLimits(business.plan);
  if (limits.maxStaff !== -1) {
    const count = await prisma.staff.count({ where: { businessId: session.user.businessId } });
    if (count >= limits.maxStaff) {
      return NextResponse.json({
        error: `Staff limit (${limits.maxStaff}) reached on your ${business.plan} plan. Upgrade to add more.`,
        code: "LIMIT_REACHED",
      }, { status: 402 });
    }
  }

  const staff = await prisma.staff.create({
    data: {
      businessId: session.user.businessId,
      name,
      role,
      email,
      phone: phone || "",
      color: color || "#0284c7",
      isActive: true,
      workingHours: JSON.stringify({
        monday: { start: "09:00", end: "18:00", isWorking: true },
        tuesday: { start: "09:00", end: "18:00", isWorking: true },
        wednesday: { start: "09:00", end: "18:00", isWorking: true },
        thursday: { start: "09:00", end: "18:00", isWorking: true },
        friday: { start: "09:00", end: "17:00", isWorking: true },
        saturday: { start: "10:00", end: "14:00", isWorking: true },
        sunday: { isWorking: false },
      }),
    },
  });

  return NextResponse.json({ staff }, { status: 201 });
}
