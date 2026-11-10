import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { twoFaUser, startAdminSession } from "@/lib/admin/auth";
import { adminAudit } from "@/lib/admin/audit";
import { generateRecoveryCodes, hashRecoveryCode, verifyTotp } from "@/lib/admin/totp";
import { decryptSecret } from "@/lib/notifications/secret";
import { rateLimit } from "@/lib/ratelimit";
import { parseBody } from "@/lib/validation/common";

export const dynamic = "force-dynamic";

/** Confirm the first code from the authenticator app: turns 2FA on, issues the recovery codes (shown ONCE) and signs the admin in. */
async function POST_handler(req: NextRequest) {
  const u = await twoFaUser();
  if (!u) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const rl = await rateLimit(`admin-2fa:${u.id}`, 8, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many attempts. Wait a minute." }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });
  if (u.adminTotpEnabledAt || !u.adminTotpSecret) return NextResponse.json({ error: "Start the setup first." }, { status: 400 });

  const parsed = await parseBody(req, z.object({ code: z.string().max(20) }));
  if (!parsed.ok) return parsed.res;
  const step = verifyTotp(decryptSecret(u.adminTotpSecret), parsed.data.code, Date.now());
  if (step === null) return NextResponse.json({ error: "That code is not right. Check the time on your phone and try again." }, { status: 400 });

  const codes = generateRecoveryCodes();
  await prisma.user.update({ where: { id: u.id }, data: { adminTotpEnabledAt: new Date(), adminTotpLastStep: step, adminRecoveryHashes: codes.map(hashRecoveryCode) } });
  await adminAudit(prisma, u, { action: "2fa.enrolled" });
  await startAdminSession(u.id);
  return NextResponse.json({ ok: true, recoveryCodes: codes });
}

export const POST = safeRoute(POST_handler);
