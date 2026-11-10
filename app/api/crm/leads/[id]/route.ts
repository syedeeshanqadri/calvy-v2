import { safeRoute } from "@/lib/api";
import { requireAdminApi } from "@/lib/admin/auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

import { parseBody } from "@/lib/validation/common";
import { leadPatchSchema } from "@/lib/validation/admin";

export const dynamic = "force-dynamic";

async function PATCH_handler(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const gate = await requireAdminApi();
  if (!gate.ok) return gate.res;

  const parsed = await parseBody(req, leadPatchSchema);
  if (!parsed.ok) return parsed.res;
  const body = parsed.data;
  const data: Record<string, unknown> = {};
  if (body.status !== undefined) data.status = body.status;
  if (body.notes !== undefined) data.notes = body.notes?.trim() || null;

  const lead = await prisma.lead.update({ where: { id: params.id }, data });
  return NextResponse.json({ lead });
}

async function DELETE_handler(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const gate = await requireAdminApi();
  if (!gate.ok) return gate.res;
  await prisma.lead.delete({ where: { id: params.id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}

export const PATCH = safeRoute(PATCH_handler);
export const DELETE = safeRoute(DELETE_handler);
