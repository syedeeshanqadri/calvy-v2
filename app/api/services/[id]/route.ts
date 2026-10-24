import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import { checkLimit, denialResponse } from "@/lib/limits";
import { parseBody } from "@/lib/validation/common";
import { servicePatchSchema } from "@/lib/validation/dashboard";

export const dynamic = 'force-dynamic';

async function PATCH_handler(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = await prisma.service.findFirst({
    where: { id: params.id, businessId: session.user.businessId },
  });
  if (!service) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const parsed = await parseBody(request, servicePatchSchema);
  if (!parsed.ok) return parsed.res;
  const body = parsed.data;

  if (body.name && body.name !== service.name) {
    const duplicate = await prisma.service.findFirst({
      where: { businessId: session.user.businessId, name: { equals: body.name, mode: "insensitive" }, NOT: { id: params.id } },
    });
    if (duplicate) {
      return NextResponse.json({ error: "A service with this name already exists" }, { status: 409 });
    }
  }

  // Turning a single-spot service into a group service needs the group-booking plan feature.
  if ((body.capacity ?? 1) > 1 && (service.capacity ?? 1) <= 1) {
    const denied = await checkLimit(session.user.businessId, "group", { capacity: body.capacity });
    if (denied) return denialResponse(denied);
  }

  const updated = await prisma.service.update({ where: { id: params.id }, data: body });
  return NextResponse.json({ service: updated });
}

async function DELETE_handler(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = await prisma.service.findFirst({
    where: { id: params.id, businessId: session.user.businessId },
  });
  if (!service) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const appointmentCount = await prisma.appointment.count({ where: { serviceId: params.id } });

  if (appointmentCount > 0) {
    await prisma.service.update({ where: { id: params.id }, data: { isActive: false } });
    return NextResponse.json({ deactivated: true, appointmentCount });
  }

  await prisma.service.delete({ where: { id: params.id } });
  return NextResponse.json({ deleted: true });
}

export const PATCH = safeRoute(PATCH_handler);
export const DELETE = safeRoute(DELETE_handler);
