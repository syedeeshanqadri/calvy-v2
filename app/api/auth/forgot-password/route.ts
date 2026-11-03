import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { notify } from "@/lib/notifications/enqueue";
import { authEmail } from "@/lib/notifications/events";
import { forgotPasswordSchema } from "@/lib/validation/auth";
import { createResetToken, createSetupToken } from "@/lib/auth-tokens";
import { readJsonBody, parseWith, tooManyRequests, testTokenHookEnabled, appBaseUrl } from "@/lib/auth-http";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const WINDOW = 15 * 60_000;

async function POST_handler(req: NextRequest) {
  const rlIp = await rateLimit(`forgot:ip:${clientIp(req)}`, 5, WINDOW);
  if (!rlIp.ok) return tooManyRequests(rlIp.retryAfter);

  const body = await readJsonBody(req);
  if (!body.ok) return body.res;
  const parsed = parseWith(forgotPasswordSchema, body.data);
  if (!parsed.ok) return parsed.res;
  const { email } = parsed.data;

  const rlEmail = await rateLimit(`forgot:email:${email}`, 3, WINDOW);
  if (!rlEmail.ok) return tooManyRequests(rlEmail.retryAfter);

  let rawToken: string | undefined;
  try {
    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      orderBy: { createdAt: "asc" },
    });
    // A passwordless, unverified account (sign-up not finished) gets a fresh setup link instead of a reset link.
    const needsSetup = !!user && !user.password && !user.emailVerified;
    if (user && (user.password || needsSetup)) {
      const { token, tokenHash, expiresAt } = needsSetup ? createSetupToken() : createResetToken();
      await prisma.$transaction([
        prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } }),
        prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash, expiresAt } }),
      ]);
      rawToken = token;
      try {
        await notify(authEmail({ template: needsSetup ? "owner_account_setup" : "password_reset", userId: user.id, to: user.email, name: user.name, token, baseUrl: appBaseUrl(req) }));
      } catch (err) {
        logger.error("[auth] reset email failed", { err });
      }
    }
  } catch (err) {
    logger.error("[auth] forgot-password error", { err });
  }

  const res: { ok: true; devToken?: string } = { ok: true };
  if (rawToken && testTokenHookEnabled()) res.devToken = rawToken;
  return NextResponse.json(res);
}

export const POST = safeRoute(POST_handler);
