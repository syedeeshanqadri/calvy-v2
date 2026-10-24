import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function DELETE_handler(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  const businessId = session?.user?.businessId;
  if (!businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const row = await prisma.timeOff.findFirst({ where: { id: params.id, businessId }, select: { id: true } });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.timeOff.delete({ where: { id: row.id } });
  return NextResponse.json({ success: true });
}

export const DELETE = safeRoute(DELETE_handler);
