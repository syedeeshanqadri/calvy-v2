import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLimits, isActivePlan } from "@/lib/plans";

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { name, description, duration, price, color, category, capacity } = body;

  if (!name || !duration || price === undefined) {
    return NextResponse.json({ error: "Name, duration, and price are required" }, { status: 400 });
  }
  if (Number(duration) < 1) {
    return NextResponse.json({ error: "Duration must be at least 1 minute" }, { status: 400 });
  }
  if (Number(price) < 0) {
    return NextResponse.json({ error: "Price cannot be negative" }, { status: 400 });
  }

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
      duration: Number(duration),
      price: Number(price),
      color: color || "#0284c7",
      category: category || "General",
      capacity: capacity ? Math.max(1, Number(capacity)) : 1,
      isActive: true,
    },
  });

  return NextResponse.json({ service }, { status: 201 });
}
