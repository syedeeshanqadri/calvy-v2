import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
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

  const body = await request.json();

  if (body.duration !== undefined && Number(body.duration) < 1) {
    return NextResponse.json({ error: "Duration must be at least 1 minute" }, { status: 400 });
  }
  if (body.price !== undefined && Number(body.price) < 0) {
    return NextResponse.json({ error: "Price cannot be negative" }, { status: 400 });
  }
  if (body.name && body.name !== service.name) {
    const duplicate = await prisma.service.findFirst({
      where: { businessId: session.user.businessId, name: { equals: body.name, mode: "insensitive" }, NOT: { id: params.id } },
    });
    if (duplicate) {
      return NextResponse.json({ error: "A service with this name already exists" }, { status: 409 });
    }
  }

  const updateData = { ...body };
  if (updateData.capacity !== undefined) updateData.capacity = Math.max(1, Number(updateData.capacity));
  const updated = await prisma.service.update({ where: { id: params.id }, data: updateData });
  return NextResponse.json({ service: updated });
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
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
