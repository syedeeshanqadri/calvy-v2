import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminSession } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

const STAGES = ["new", "contacted", "qualified", "demo", "won", "lost"];

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAdminSession())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const data: Record<string, unknown> = {};

  if (body.status !== undefined) {
    if (!STAGES.includes(body.status)) return NextResponse.json({ error: "Invalid stage" }, { status: 400 });
    data.status = body.status;
  }
  if (body.notes !== undefined) data.notes = body.notes?.trim() || null;

  const lead = await prisma.lead.update({ where: { id: params.id }, data });
  return NextResponse.json({ lead });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAdminSession())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await prisma.lead.delete({ where: { id: params.id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
