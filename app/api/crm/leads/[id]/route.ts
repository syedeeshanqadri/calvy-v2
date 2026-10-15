import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminSession } from "@/lib/adminAuth";

import { parseBody } from "@/lib/validation/common";
import { leadPatchSchema } from "@/lib/validation/admin";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!(await isAdminSession())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = await parseBody(req, leadPatchSchema);
  if (!parsed.ok) return parsed.res;
  const body = parsed.data;
  const data: Record<string, unknown> = {};
  if (body.status !== undefined) data.status = body.status;
  if (body.notes !== undefined) data.notes = body.notes?.trim() || null;

  const lead = await prisma.lead.update({ where: { id: params.id }, data });
  return NextResponse.json({ lead });
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!(await isAdminSession())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await prisma.lead.delete({ where: { id: params.id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
