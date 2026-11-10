import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { twoFaUser, startAdminSession } from "@/lib/admin/auth";
import { adminAudit } from "@/lib/admin/audit";
import { findRecoveryCode, verifyTotp } from "@/lib/admin/totp";
import { decryptSecret } from "@/lib/notifications/secret";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { parseBody } from "@/lib/validation/common";

export const dynamic = "force-dynamic";

/** Sign in to the admin area with an authenticator code, or with one single-use recovery code. */
async function POST_handler(req: NextRequest) {
  const u = await twoFaUser();
  if (!u) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const rl = await rateLimit(`admin-2fa:${u.id}`, 8, 60_000);
  const rlIp = await rateLimit(`admin-2fa-ip:${clientIp(req)}`, 20, 60_000);
  if (!rl.ok || !rlIp.ok) return NextResponse.json({ error: "Too many attempts. Wait a minute." }, { status: 429, headers: { "Retry-After": String(Math.max(rl.retryAfter ?? 0, rlIp.retryAfter ?? 0) || 60) } });
  if (!u.adminTotpEnabledAt || !u.adminTotpSecret) return NextResponse.json({ error: "Set up two-factor sign-in first.", code: "ADMIN_2FA_SETUP" }, { status: 400 });

  const parsed = await parseBody(req, z.object({ code: z.string().max(20).optional(), recoveryCode: z.string().max(30).optional() }).refine((b) => b.code || b.recoveryCode, "Enter a code."));
  if (!parsed.ok) return parsed.res;

  if (parsed.data.recoveryCode) {
    const i = findRecoveryCode(u.adminRecoveryHashes, parsed.data.recoveryCode);
    if (i < 0) { await adminAudit(prisma, u, { action: "2fa.failed", detail: { how: "recovery" } }); return NextResponse.json({ error: "That recovery code is not valid." }, { status: 400 }); }
    // Single use: claim the exact hash so two parallel requests cannot both spend it.
    const hash = u.adminRecoveryHashes[i];
    const left = u.adminRecoveryHashes.filter((_, j) => j !== i);
    const claimed = await prisma.user.updateMany({ where: { id: u.id, adminRecoveryHashes: { has: hash } }, data: { adminRecoveryHashes: left } });
    if (claimed.count !== 1) return NextResponse.json({ error: "That recovery code is not valid." }, { status: 400 });
    await adminAudit(prisma, u, { action: "2fa.recovery_used", detail: { remaining: left.length } });
    await startAdminSession(u.id);
    return NextResponse.json({ ok: true, recoveryCodesLeft: left.length });
  }

  const step = verifyTotp(decryptSecret(u.adminTotpSecret), parsed.data.code ?? "", Date.now(), u.adminTotpLastStep);
  if (step === null) { await adminAudit(prisma, u, { action: "2fa.failed", detail: { how: "totp" } }); return NextResponse.json({ error: "That code is not right or was already used." }, { status: 400 }); }
  await prisma.user.update({ where: { id: u.id }, data: { adminTotpLastStep: step } });
  await adminAudit(prisma, u, { action: "2fa.verified" });
  await startAdminSession(u.id);
  return NextResponse.json({ ok: true });
}

export const POST = safeRoute(POST_handler);
