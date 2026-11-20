import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/ratelimit";
import { notify } from "@/lib/notifications/enqueue";
import { authEmail } from "@/lib/notifications/events";
import { createSetupToken } from "@/lib/auth-tokens";
import { appBaseUrl, testTokenHookEnabled } from "@/lib/auth-http";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/** The "Verify your email" banner's resend button: a fresh single-use link (7 days) that verifies the address and lets the owner set a password. */
async function POST_handler(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const uid = session?.user?.id;
  if (!uid || session.user.kind === "customer") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rl = await rateLimit(`verify-resend:${uid}`, 3, 15 * 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Please wait a few minutes before asking again." }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });

  const user = await prisma.user.findUnique({ where: { id: uid }, select: { id: true, name: true, email: true, emailVerified: true } });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.emailVerified) return NextResponse.json({ ok: true, alreadyVerified: true });

  const { token, tokenHash, expiresAt } = createSetupToken();
  await prisma.$transaction([
    prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } }),
    prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash, expiresAt } }),
  ]);
  try {
    await notify(authEmail({ template: "owner_account_setup", userId: user.id, to: user.email, name: user.name, token, baseUrl: appBaseUrl(req) }));
  } catch (err) {
    logger.error("[verify] resend email not queued", { err });
  }
  return NextResponse.json({ ok: true, ...(testTokenHookEnabled() ? { devToken: token } : {}) });
}

export const POST = safeRoute(POST_handler);
