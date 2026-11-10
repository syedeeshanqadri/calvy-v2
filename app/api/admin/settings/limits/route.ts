import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { needsReauth, requireAdminApi } from "@/lib/admin/auth";
import { adminAudit } from "@/lib/admin/audit";
import { VERIFIED_KEYS, getVerifiedLimits } from "@/lib/verifiedLimits";
import { parseBody } from "@/lib/validation/common";

export const dynamic = "force-dynamic";

const schema = z.object({
  maxUpcomingPerBusiness: z.coerce.number().int().min(0).max(100),
  maxNewPer24h: z.coerce.number().int().min(0).max(100),
  reason: z.string().trim().min(8, "Give a reason (at least 8 characters).").max(500),
});

/** Verified-customer booking limits (0 = no limit). Needs a reason and a fresh authenticator code; audited with before and after. */
async function PUT_handler(req: NextRequest) {
  const gate = await requireAdminApi();
  if (!gate.ok) return gate.res;
  const re = needsReauth(gate.ctx);
  if (re) return re;
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.res;
  const before = await getVerifiedLimits(prisma);
  await prisma.$transaction(async (tx) => {
    await tx.appSetting.upsert({ where: { key: VERIFIED_KEYS.upcoming }, update: { value: String(parsed.data.maxUpcomingPerBusiness) }, create: { key: VERIFIED_KEYS.upcoming, value: String(parsed.data.maxUpcomingPerBusiness) } });
    await tx.appSetting.upsert({ where: { key: VERIFIED_KEYS.new24 }, update: { value: String(parsed.data.maxNewPer24h) }, create: { key: VERIFIED_KEYS.new24, value: String(parsed.data.maxNewPer24h) } });
    await adminAudit(tx, gate.ctx.user, { action: "settings.limits_changed", reason: parsed.data.reason, detail: { before, after: { maxUpcomingPerBusiness: parsed.data.maxUpcomingPerBusiness, maxNewPer24h: parsed.data.maxNewPer24h } } });
  });
  return NextResponse.json({ ok: true });
}

export const PUT = safeRoute(PUT_handler);
