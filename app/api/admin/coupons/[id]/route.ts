import { requireAdminApi } from "@/lib/admin/auth";
import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseBody } from "@/lib/validation/common";
import { adminAudit } from "@/lib/admin/audit";
import { CALVY_OWNER } from "@/lib/coupons/service";

export const dynamic = "force-dynamic";

// A coupon is never deleted (the usage log and audit trail point at it); it is switched off. Money fields cannot change once made.
const schema = z.object({ active: z.boolean().optional(), endsAt: z.string().max(40).nullable().optional(), maxRedemptions: z.number().int().min(1).max(1_000_000).nullable().optional() });

async function PATCH_handler(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const gate = await requireAdminApi();
  if (!gate.ok) return gate.res;
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.res;
  const d = parsed.data;
  const endsAt = d.endsAt === undefined ? undefined : d.endsAt === null ? null : new Date(d.endsAt);
  if (endsAt && Number.isNaN(endsAt.getTime())) return NextResponse.json({ error: "Not a valid date." }, { status: 400 });
  const r = await prisma.$transaction(async (tx) => {
    const done = await tx.coupon.updateMany({
      where: { id, ownerKey: CALVY_OWNER },
      data: { ...(d.active !== undefined && { active: d.active }), ...(endsAt !== undefined && { endsAt }), ...(d.maxRedemptions !== undefined && { maxRedemptions: d.maxRedemptions }) },
    });
    if (done.count === 1) await adminAudit(tx, gate.ctx.user, { action: "coupon.update", detail: { id, ...d } });
    return done.count;
  });
  if (r !== 1) return NextResponse.json({ error: "Coupon not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export const PATCH = safeRoute(PATCH_handler);
