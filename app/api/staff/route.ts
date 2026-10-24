import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { linkStaffToAllServices } from "@/lib/schedule";
import { checkLimit, denialResponse } from "@/lib/limits";

import { parseBody } from "@/lib/validation/common";
import { staffCreateSchema } from "@/lib/validation/dashboard";

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

  const parsed = await parseBody(request, staffCreateSchema);
  if (!parsed.ok) return parsed.res;
  const { name, role, email, phone, color } = parsed.data;

  const denied = await checkLimit(session.user.businessId, "staff", { owner: true });
  if (denied) return denialResponse(denied);

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

  await linkStaffToAllServices(prisma, session.user.businessId, staff.id);

  return NextResponse.json({ staff }, { status: 201 });
}
