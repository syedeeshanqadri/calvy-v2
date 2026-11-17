import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { accessSession } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { gatewayPlanBlock } from "@/lib/payments/access";
import { verifyGateway } from "@/lib/payments/gateways";
import { gatewayView } from "@/lib/payments/gatewayStore";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** "Verify": a real, lightweight call to the provider. CONNECTED or ERROR with the reason. Owner only. */
async function POST_handler(_req: NextRequest, { params }: Ctx) {
  const session = await accessSession("owner");
  if (!session?.user?.businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const businessId = session.user.businessId;
  const blocked = await gatewayPlanBlock(businessId);
  if (blocked) return blocked;
  const { id } = await params;
  const g = await prisma.paymentGateway.findFirst({ where: { id, businessId } });
  if (!g) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const result = await verifyGateway(g);
  const hasDefault = (await prisma.paymentGateway.count({ where: { businessId, isDefault: true, NOT: { id } } })) > 0;
  const updated = await prisma.paymentGateway.update({
    where: { id },
    data: result.ok
      ? { status: "CONNECTED", statusReason: null, lastVerifiedAt: new Date(), enabled: true, isDefault: g.isDefault || !hasDefault }
      : { status: "ERROR", statusReason: result.reason, enabled: false, isDefault: false },
  });
  await audit({ businessId, actorId: session.user.id ?? "owner", action: "gateway.verified", target: id, detail: { ok: result.ok } });
  return NextResponse.json({ gateway: gatewayView(updated) });
}

export const POST = safeRoute(POST_handler);
