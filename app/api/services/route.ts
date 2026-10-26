import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { linkServiceToAllStaff } from "@/lib/schedule";
import { checkLimit, denialResponse } from "@/lib/limits";

import { parseBody } from "@/lib/validation/common";
import { serviceCreateSchema } from "@/lib/validation/dashboard";

export const dynamic = 'force-dynamic';

async function POST_handler(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = await parseBody(request, serviceCreateSchema);
  if (!parsed.ok) return parsed.res;
  const { name, description, duration, price, color, category, capacity, bufferBeforeMin, bufferAfterMin, mode, meetingUrl } = parsed.data;

  const duplicate = await prisma.service.findFirst({
    where: { businessId: session.user.businessId, name: { equals: name, mode: "insensitive" } },
  });
  if (duplicate) {
    return NextResponse.json({ error: "A service with this name already exists" }, { status: 409 });
  }

  const denied =
    (await checkLimit(session.user.businessId, "services", { owner: true })) ??
    (await checkLimit(session.user.businessId, "group", { capacity }));
  if (denied) return denialResponse(denied);

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
      mode: mode ?? "IN_PERSON",
      meetingUrl: meetingUrl || null,
      isActive: true,
    },
  });
  await linkServiceToAllStaff(prisma, session.user.businessId, service.id);

  return NextResponse.json({ service }, { status: 201 });
}

export const POST = safeRoute(POST_handler);
