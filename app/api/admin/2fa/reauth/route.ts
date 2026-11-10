import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminApi, twoFaUser } from "@/lib/admin/auth";
import { adminAudit } from "@/lib/admin/audit";
import { verifyTotp } from "@/lib/admin/totp";
import { decryptSecret } from "@/lib/notifications/secret";
import { rateLimit } from "@/lib/ratelimit";
import { parseBody } from "@/lib/validation/common";

export const dynamic = "force-dynamic";

/** A fresh authenticator code opens a 5-minute window for sensitive actions. */
async function POST_handler(req: NextRequest) {
  const gate = await requireAdminApi();
  if (!gate.ok) return gate.res;
  const rl = await rateLimit(`admin-2fa:${gate.ctx.user.id}`, 8, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many attempts. Wait a minute." }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });
  const u = await twoFaUser();
  if (!u?.adminTotpSecret) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = await parseBody(req, z.object({ code: z.string().max(20) }));
  if (!parsed.ok) return parsed.res;
  const step = verifyTotp(decryptSecret(u.adminTotpSecret), parsed.data.code, Date.now(), u.adminTotpLastStep);
  if (step === null) { await adminAudit(prisma, u, { action: "2fa.failed", detail: { how: "reauth" } }); return NextResponse.json({ error: "That code is not right or was already used." }, { status: 400 }); }
  await prisma.user.update({ where: { id: u.id }, data: { adminTotpLastStep: step } });
  await prisma.adminSession.update({ where: { id: gate.ctx.sessionId }, data: { reauthAt: new Date() } });
  await adminAudit(prisma, u, { action: "reauth" });
  return NextResponse.json({ ok: true });
}

export const POST = safeRoute(POST_handler);
