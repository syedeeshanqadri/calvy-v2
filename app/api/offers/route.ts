import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { accessSession } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { parseBody } from "@/lib/validation/common";
import { checkLimit, denialResponse } from "@/lib/limits";
import { audit } from "@/lib/audit";
import { offerInputSchema } from "@/lib/coupons/validation";

export const dynamic = "force-dynamic";

/** Make a business-funded offer (paid plans). It applies automatically at booking and is paid for by the business. */
async function POST_handler(req: NextRequest) {
  const session = await accessSession("services.manage");
  if (!session?.user?.businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const businessId = session.user.businessId;
  const denied = await checkLimit(businessId, "offers", { owner: true });
  if (denied) return denialResponse(denied);
  const parsed = await parseBody(req, offerInputSchema);
  if (!parsed.ok) return parsed.res;
  const o = parsed.data;
  // Every service must be this business's own (tenant isolation).
  if (o.serviceIds.length > 0) {
    const own = await prisma.service.count({ where: { businessId, id: { in: o.serviceIds } } });
    if (own !== new Set(o.serviceIds).size) return NextResponse.json({ error: "One of those services is not yours." }, { status: 400 });
  }
  if ((await prisma.businessOffer.count({ where: { businessId } })) >= 50) return NextResponse.json({ error: "You have reached the limit of 50 offers. Remove one first." }, { status: 400 });
  const row = await prisma.businessOffer.create({
    data: {
      businessId, kind: o.kind, name: o.name, percent: o.percent, nth: o.kind === "NTH_VISIT" ? o.nth ?? null : null,
      days: o.kind === "HAPPY_HOUR" ? [...new Set(o.days)].sort() : [], startMinute: o.kind === "HAPPY_HOUR" ? o.startMinute ?? null : null, endMinute: o.kind === "HAPPY_HOUR" ? o.endMinute ?? null : null,
      serviceIds: o.serviceIds, startsAt: o.startsAt ?? null, endsAt: o.endsAt ?? null, active: o.active, showOnSite: o.showOnSite,
    },
  });
  await audit({ businessId, actorId: session.user.id, action: "offer.created", target: row.id, detail: { kind: row.kind, name: row.name, percent: row.percent } });
  return NextResponse.json({ ok: true, id: row.id });
}

export const POST = safeRoute(POST_handler);
