import { requireAdminApi, cleanReason } from "@/lib/admin/auth";
import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseBody } from "@/lib/validation/common";
import { adminAudit } from "@/lib/admin/audit";
import { levelConfigSchema } from "@/lib/rewards/levels";
import { CONFIG_ID, getLevelConfig } from "@/lib/rewards/levelService";

export const dynamic = "force-dynamic";

const body = z.object({ config: levelConfigSchema, reason: z.string().max(500) });

/** Save the Calvy Levels settings (fees, requirements, windows, retention, fast-track). No deploy needed; every change is audited with before and after. */
async function PUT_handler(req: NextRequest) {
  const gate = await requireAdminApi();
  if (!gate.ok) return gate.res;
  const parsed = await parseBody(req, body);
  if (!parsed.ok) return parsed.res;
  const reason = cleanReason(parsed.data.reason);
  if (!reason) return NextResponse.json({ error: "Give a reason of at least 8 characters." }, { status: 400 });
  await prisma.$transaction(async (tx) => {
    const before = await getLevelConfig(tx);
    const json = parsed.data.config as unknown as Prisma.InputJsonValue;
    await tx.levelConfig.upsert({ where: { id: CONFIG_ID }, create: { id: CONFIG_ID, config: json, updatedBy: gate.ctx.user.id }, update: { config: json, updatedBy: gate.ctx.user.id } });
    await adminAudit(tx, gate.ctx.user, { action: "rewards.config_changed", reason, detail: { before, after: parsed.data.config } });
  });
  return NextResponse.json({ ok: true });
}

export const PUT = safeRoute(PUT_handler);
