import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { linkServiceToAllStaff } from "@/lib/schedule";
import { getLimits, isActivePlan } from "@/lib/plans";

import { parseBody } from "@/lib/validation/common";
import { serviceCreateSchema } from "@/lib/validation/dashboard";

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = await parseBody(request, serviceCreateSchema);
  if (!parsed.ok) return parsed.res;
  const { name, description, duration, price, color, category, capacity, bufferBeforeMin, bufferAfterMin } = parsed.data;

  const duplicate = await prisma.service.findFirst({
    where: { businessId: session.user.businessId, name: { equals: name, mode: "insensitive" } },
  });
  if (duplicate) {
    return NextResponse.json({ error: "A service with this name already exists" }, { status: 409 });
  }

  const business = await prisma.business.findUnique({
    where: { id: session.user.businessId },
    select: { plan: true, planStatus: true, trialEndsAt: true },
  });
  if (!business || !isActivePlan(business.planStatus, business.plan, business.trialEndsAt)) {
    return NextResponse.json({ error: "Your trial has expired. Please upgrade to continue.", code: "PLAN_EXPIRED" }, { status: 402 });
  }
  const limits = getLimits(business.plan);
  if (limits.maxServices !== -1) {
    const count = await prisma.service.count({ where: { businessId: session.user.businessId } });
    if (count >= limits.maxServices) {
      return NextResponse.json({ error: `Service limit (${limits.maxServices}) reached. Upgrade your plan.`, code: "LIMIT_REACHED" }, { status: 402 });
    }
  }

  const service = await prisma.service.create({
    data: {
      businessId: session.user.businessId,
      name,
      description: description || "",
      duration,
      price,
      color: color || "#0284c7",
      category: category || "General",
      capacity: capacity ?? 1,
      bufferBeforeMin: bufferBeforeMin ?? 0,
      bufferAfterMin: bufferAfterMin ?? 0,
      isActive: true,
    },
  });
  await linkServiceToAllStaff(prisma, session.user.businessId, service.id);

  return NextResponse.json({ service }, { status: 201 });
}
