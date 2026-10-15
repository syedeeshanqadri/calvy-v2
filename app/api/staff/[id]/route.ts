import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import { parseBody } from "@/lib/validation/common";
import { staffPatchSchema } from "@/lib/validation/dashboard";

export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const existing = await prisma.staff.findFirst({
    where: { id: params.id, businessId: session.user.businessId },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = await parseBody(request, staffPatchSchema);
  if (!parsed.ok) return parsed.res;
  const { name, role, email, phone, color, isActive } = parsed.data;

  const staff = await prisma.staff.update({
    where: { id: params.id },
    data: {
      ...(name !== undefined && { name }),
      ...(role !== undefined && { role }),
      ...(email !== undefined && { email }),
      ...(phone !== undefined && { phone }),
      ...(color !== undefined && { color }),
      ...(isActive !== undefined && { isActive }),
    },
  });

  return NextResponse.json({ staff });
}

export async function DELETE(_: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const existing = await prisma.staff.findFirst({
    where: { id: params.id, businessId: session.user.businessId },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.staff.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
