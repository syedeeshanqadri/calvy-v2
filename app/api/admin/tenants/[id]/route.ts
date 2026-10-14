import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

function isAdmin(session: Awaited<ReturnType<typeof getServerSession>> & { user?: { role?: string; email?: string | null } } | null) {
  return session?.user?.role === "admin" || session?.user?.email === process.env.SUPER_ADMIN_EMAIL;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { plan, planStatus, trialEndsAt } = body;

  const updated = await prisma.business.update({
    where: { id: params.id },
    data: {
      ...(plan !== undefined && { plan }),
      ...(planStatus !== undefined && { planStatus }),
      ...(trialEndsAt !== undefined && { trialEndsAt: trialEndsAt ? new Date(trialEndsAt) : null }),
    },
  });

  return NextResponse.json({ business: updated });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Delete business (cascades to staff, services, clients, appointments)
  await prisma.business.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
