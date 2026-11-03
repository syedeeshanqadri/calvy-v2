import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import { revalidateSite } from "@/lib/revalidateSite";
import { parseBody } from "@/lib/validation/common";
import { staffPatchSchema } from "@/lib/validation/dashboard";

export const dynamic = 'force-dynamic';

async function PATCH_handler(request: NextRequest, props: { params: Promise<{ id: string }> }) {
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
  const { name, role, email, phone, color, isActive, meetingUrl, photoUrl, bio, specialisation } = parsed.data;

  const staff = await prisma.staff.update({
    where: { id: params.id },
    data: {
      ...(name !== undefined && { name }),
      ...(role !== undefined && { role }),
      ...(email !== undefined && { email }),
      ...(phone !== undefined && { phone }),
      ...(color !== undefined && { color }),
      ...(isActive !== undefined && { isActive }),
      ...(meetingUrl !== undefined && { meetingUrl: meetingUrl || null }),
      ...(photoUrl !== undefined && { photoUrl: photoUrl || null }),
      ...(bio !== undefined && { bio: bio || null }),
      ...(specialisation !== undefined && { specialisation: specialisation || null }),
    },
  });

  await revalidateSite(session.user.businessId);
  return NextResponse.json({ staff });
}

async function DELETE_handler(_: NextRequest, props: { params: Promise<{ id: string }> }) {
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

export const PATCH = safeRoute(PATCH_handler);
export const DELETE = safeRoute(DELETE_handler);
