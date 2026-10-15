import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import { parseBody } from "@/lib/validation/common";
import { expensePatchSchema } from "@/lib/validation/dashboard";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const expense = await prisma.expense.findFirst({
    where: { id: params.id, businessId: session.user.businessId },
  });
  if (!expense) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = await parseBody(req, expensePatchSchema);
  if (!parsed.ok) return parsed.res;
  const { amount, category, description, date } = parsed.data;

  const updated = await prisma.expense.update({
    where: { id: params.id },
    data: {
      ...(amount !== undefined && { amount }),
      ...(category !== undefined && { category }),
      ...(description !== undefined && { description: description?.trim() || null }),
      ...(date !== undefined && { date: new Date(date) }),
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const expense = await prisma.expense.findFirst({
    where: { id: params.id, businessId: session.user.businessId },
  });
  if (!expense) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.expense.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
