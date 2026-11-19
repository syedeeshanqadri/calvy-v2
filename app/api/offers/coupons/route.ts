import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { accessSession } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { parseBody } from "@/lib/validation/common";
import { checkLimit, denialResponse } from "@/lib/limits";
import { audit } from "@/lib/audit";
import { businessCouponSchema } from "@/lib/coupons/validation";

export const dynamic = "force-dynamic";

/** Make a coupon for this business's own services (paid plans). The discount comes out of the business's price; Calvy never touches it. */
async function POST_handler(req: NextRequest) {
  const session = await accessSession("services.manage");
  if (!session?.user?.businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const businessId = session.user.businessId;
  const denied = await checkLimit(businessId, "offers", { owner: true });
  if (denied) return denialResponse(denied);
  const parsed = await parseBody(req, businessCouponSchema);
  if (!parsed.ok) return parsed.res;
  const c = parsed.data;
  if (c.serviceIds.length > 0) {
    const own = await prisma.service.count({ where: { businessId, id: { in: c.serviceIds } } });
    if (own !== new Set(c.serviceIds).size) return NextResponse.json({ error: "One of those services is not yours." }, { status: 400 });
  }
  if ((await prisma.coupon.count({ where: { ownerKey: businessId } })) >= 200) return NextResponse.json({ error: "You have reached the limit of 200 coupons." }, { status: 400 });
  try {
    const row = await prisma.coupon.create({
      data: {
        // The owner is always the signed-in business, never taken from the request.
        ownerKey: businessId, businessId, code: c.code, name: c.name, target: "SERVICE", kind: c.kind, value: c.value, minAmountMinor: c.minAmountMinor,
        startsAt: c.startsAt ?? null, endsAt: c.endsAt ?? null, maxRedemptions: c.maxRedemptions ?? null, perCustomerLimit: c.perCustomerLimit,
        firstBookingOnly: c.firstBookingOnly, planIds: [], businessIds: [], serviceIds: c.serviceIds, createdBy: session.user.id,
      },
    });
    await audit({ businessId, actorId: session.user.id, action: "coupon.created", target: row.id, detail: { code: row.code, kind: row.kind, value: row.value } });
    return NextResponse.json({ ok: true, id: row.id });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return NextResponse.json({ error: "You already have a coupon with that code." }, { status: 409 });
    throw e;
  }
}

export const POST = safeRoute(POST_handler);
