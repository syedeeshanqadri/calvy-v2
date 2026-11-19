import { requireAdminApi } from "@/lib/admin/auth";
import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseBody } from "@/lib/validation/common";
import { adminAudit } from "@/lib/admin/audit";
import { couponInputSchema } from "@/lib/coupons/validation";
import { CALVY_OWNER } from "@/lib/coupons/service";

export const dynamic = "force-dynamic";

/** Make a Calvy coupon: discounts the Rs 10 fee or a plan's first payment. A business's own coupons are made in its dashboard, never here. */
async function POST_handler(req: NextRequest) {
  const gate = await requireAdminApi();
  if (!gate.ok) return gate.res;
  const parsed = await parseBody(req, couponInputSchema);
  if (!parsed.ok) return parsed.res;
  const c = parsed.data;
  if (c.target === "SERVICE") return NextResponse.json({ error: "Coupons for a business's services are made by that business." }, { status: 400 });
  if (c.target === "FEE" && c.kind === "FLAT" && c.value > 1000) return NextResponse.json({ error: "A flat fee coupon is at most 1000 paise (Rs 10)." }, { status: 400 });
  try {
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.coupon.create({
        data: {
          ownerKey: CALVY_OWNER, businessId: null, code: c.code, name: c.name, target: c.target, kind: c.kind, value: c.value, minAmountMinor: c.minAmountMinor,
          startsAt: c.startsAt ?? null, endsAt: c.endsAt ?? null, maxRedemptions: c.maxRedemptions ?? null, perCustomerLimit: c.perCustomerLimit,
          firstBookingOnly: c.firstBookingOnly, planIds: c.planIds, businessIds: c.businessIds, serviceIds: [], active: c.active, createdBy: gate.ctx.user.id,
        },
      });
      await adminAudit(tx, gate.ctx.user, { action: "coupon.create", detail: { id: row.id, code: row.code, target: row.target, kind: row.kind, value: row.value } });
      return row;
    });
    return NextResponse.json({ ok: true, id: created.id });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return NextResponse.json({ error: "That code is already taken." }, { status: 409 });
    throw e;
  }
}

export const POST = safeRoute(POST_handler);
