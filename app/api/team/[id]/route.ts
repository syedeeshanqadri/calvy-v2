import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { accessSession } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS, sanitizePermissions } from "@/lib/permissions";
import { id, parseBody, text } from "@/lib/validation/common";
import { audit } from "@/lib/audit";
import { removeMember, serializeMember } from "@/lib/teamDb";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: text(80).min(1).optional(),
  roleName: text(40).min(1).optional(),
  permissions: z.array(z.enum(PERMISSIONS)).optional(),
  staffId: id.nullish(),
});

type Ctx = { params: Promise<{ id: string }> };

// Owner only. A member can never reach this: accessSession("owner") refuses them with 403.
async function PATCH_handler(req: NextRequest, { params }: Ctx) {
  const s = await accessSession("owner");
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: memberId } = await params;
  const businessId = s.user.businessId;

  const parsed = await parseBody(req, patchSchema);
  if (!parsed.ok) return parsed.res;
  const b = parsed.data;

  const existing = await prisma.teamMember.findFirst({ where: { id: memberId, businessId } });
  if (!existing) return NextResponse.json({ error: "Team member not found." }, { status: 404 });
  if (b.staffId && !(await prisma.staff.findFirst({ where: { id: b.staffId, businessId }, select: { id: true } }))) {
    return NextResponse.json({ error: "That staff record was not found." }, { status: 404 });
  }

  const nextPerms = b.permissions ? sanitizePermissions(b.permissions) : undefined;
  const updated = await prisma.teamMember.update({
    where: { id: existing.id },
    data: {
      ...(b.name !== undefined && { name: b.name }),
      ...(b.roleName !== undefined && { roleName: b.roleName }),
      ...(nextPerms && { permissions: nextPerms }),
      ...(b.staffId !== undefined && { staffId: b.staffId }),
    },
  });
  if (nextPerms) {
    await audit({ businessId, actorId: s.user.id, action: "team.permissions_changed", target: existing.email, detail: { from: existing.permissions, to: nextPerms } });
  }
  return NextResponse.json({ member: serializeMember(updated) });
}

async function DELETE_handler(_req: NextRequest, { params }: Ctx) {
  const s = await accessSession("owner");
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: memberId } = await params;
  const removed = await removeMember(memberId, s.user.businessId);
  if (!removed) return NextResponse.json({ error: "Team member not found." }, { status: 404 });
  await audit({ businessId: s.user.businessId, actorId: s.user.id, action: "team.member_removed", target: removed.email });
  return NextResponse.json({ ok: true });
}

export const PATCH = safeRoute(PATCH_handler);
export const DELETE = safeRoute(DELETE_handler);
