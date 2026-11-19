import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { accessSession } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { parseBody } from "@/lib/validation/common";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// A coupon is switched off, never deleted: the usage log points at it.
const schema = z.object({ active: z.boolean() });

async function PATCH_handler(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await accessSession("services.manage");
  if (!session?.user?.businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.res;
  const businessId = session.user.businessId;
  // Only this business's own coupons; a Calvy coupon or another business's id matches nothing.
  const r = await prisma.coupon.updateMany({ where: { id, ownerKey: businessId, businessId }, data: { active: parsed.data.active } });
  if (r.count !== 1) return NextResponse.json({ error: "Coupon not found." }, { status: 404 });
  await audit({ businessId, actorId: session.user.id, action: "coupon.updated", target: id, detail: parsed.data });
  return NextResponse.json({ ok: true });
}

export const PATCH = safeRoute(PATCH_handler);
