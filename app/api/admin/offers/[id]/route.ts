import { requireAdminApi } from "@/lib/admin/auth";
import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseBody } from "@/lib/validation/common";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const schema = z.object({ enabled: z.boolean() });

/** Switch an offer on or off. Off stops new visits counting and stops rewards being spent; earned rewards are kept and work again when it is back on. */
async function PATCH_handler(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const gate = await requireAdminApi();
  if (!gate.ok) return gate.res;
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.res;
  const r = await prisma.offer.updateMany({ where: { id }, data: { enabled: parsed.data.enabled } });
  if (r.count !== 1) return NextResponse.json({ error: "Offer not found." }, { status: 404 });
  logger.info("[Admin] offer switched", { offerId: id, enabled: parsed.data.enabled });
  return NextResponse.json({ ok: true, enabled: parsed.data.enabled });
}

export const PATCH = safeRoute(PATCH_handler);
