import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { VIEW_AS_MS, cleanReason, needsReauth, requireAdminApi } from "@/lib/admin/auth";
import { adminAudit } from "@/lib/admin/audit";
import { rateLimit } from "@/lib/ratelimit";
import { parseBody } from "@/lib/validation/common";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ businessId: z.string().min(1).max(64), mode: z.enum(["READ", "ACT"]), reason: z.string().max(600) });

/**
 * Start viewing a business as its owner. READ by default; ACT (can edit) is a separate explicit choice with its own reason
 * and a fresh authenticator code. Both need a written reason, expire after 30 minutes, and are written to the admin audit log.
 */
async function POST_handler(req: NextRequest) {
  const gate = await requireAdminApi();
  if (!gate.ok) return gate.res;
  const { ctx } = gate;
  const rl = await rateLimit(`admin-viewas:${ctx.user.id}`, 20, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });

  const parsed = await parseBody(req, bodySchema);
  if (!parsed.ok) return parsed.res;
  const reason = cleanReason(parsed.data.reason);
  if (!reason) return NextResponse.json({ error: "Give a reason (at least 8 characters)." }, { status: 400 });
  if (ctx.viewAs) return NextResponse.json({ error: "Exit the current view-as first.", code: "VIEW_AS_ACTIVE" }, { status: 409 });
  if (parsed.data.mode === "ACT") {
    const re = needsReauth(ctx);
    if (re) return re;
  }
  const business = await prisma.business.findUnique({ where: { id: parsed.data.businessId }, select: { id: true, name: true } });
  if (!business) return NextResponse.json({ error: "Business not found." }, { status: 404 });

  const now = new Date();
  const expiresAt = new Date(now.getTime() + VIEW_AS_MS);
  await prisma.$transaction(async (tx) => {
    const auditId = await adminAudit(tx, ctx.user, { action: parsed.data.mode === "ACT" ? "act_as.start" : "view_as.start", businessId: business.id, reason, detail: { expiresAt: expiresAt.toISOString() } });
    await tx.adminSession.update({
      where: { id: ctx.sessionId },
      data: { viewAsBusinessId: business.id, viewAsMode: parsed.data.mode, viewAsReason: reason, viewAsStartedAt: now, viewAsExpiresAt: expiresAt, viewAsAuditId: auditId },
    });
  });
  return NextResponse.json({ ok: true, mode: parsed.data.mode, expiresAt, businessName: business.name });
}

export const POST = safeRoute(POST_handler);
