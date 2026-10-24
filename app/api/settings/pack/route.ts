import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEffectiveLimits } from "@/lib/getFeatures";
import { getPack, packForBusinessType } from "@/lib/packs";
import { applyPackDefaults } from "@/lib/packs/apply";
import { PACK_IDS } from "@/lib/packs/types";
import { parseBody } from "@/lib/validation/common";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  packId: z.enum(PACK_IDS),
  /** Also add the pack's default services (idempotent; existing services are never touched). */
  applyDefaults: z.boolean().optional(),
});

// Change the business pack and optionally apply its default services.
async function POST_handler(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const businessId = session?.user?.businessId;
  if (!businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = await parseBody(req, bodySchema);
  if (!parsed.ok) return parsed.res;
  const { packId, applyDefaults } = parsed.data;

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { plan: true, planStatus: true, trialEndsAt: true, packId: true, businessType: true },
  });
  if (!business) return NextResponse.json({ error: "Business not found." }, { status: 404 });

  const pack = getPack(packId);
  const limits = await getEffectiveLimits(business);

  const result = await prisma.$transaction(async (tx) => {
    // Serialise parallel "apply" clicks so the same default is not created twice.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"pack:" + businessId}, 0))`;
    // Keep a finer legacy type (e.g. "dental" inside Clinic) when the pack itself is unchanged.
    const keepType = packForBusinessType(business.businessType) === packId;
    await tx.business.update({
      where: { id: businessId },
      data: { packId, ...(keepType ? {} : { businessType: pack.businessType }) },
    });
    return applyDefaults ? applyPackDefaults(tx, businessId, packId, limits.maxServices) : null;
  });

  return NextResponse.json({ packId, applied: result });
}

export const POST = safeRoute(POST_handler);
