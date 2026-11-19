import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { notify } from "@/lib/notifications/enqueue";
import { ownerMagicLinkEmail } from "@/lib/notifications/events";
import { forgotPasswordSchema } from "@/lib/validation/auth";
import { issueOwnerLoginToken } from "@/lib/ownerLogin";
import { readJsonBody, parseWith, tooManyRequests, testTokenHookEnabled, appBaseUrl } from "@/lib/auth-http";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const WINDOW = 15 * 60_000;

/**
 * "Email me a sign-in link" on the sign-in page. Always answers the same way, whether or not the address has an account, so it cannot be used to
 * find out who is registered. The link works once, lasts 15 minutes, signs the owner in and verifies the address. Calvy admins never get one
 * (they sign in with a password and an authenticator code).
 */
async function POST_handler(req: NextRequest) {
  const rlIp = await rateLimit(`magic:ip:${clientIp(req)}`, 10, WINDOW);
  if (!rlIp.ok) return tooManyRequests(rlIp.retryAfter);
  const body = await readJsonBody(req);
  if (!body.ok) return body.res;
  const parsed = parseWith(forgotPasswordSchema, body.data);
  if (!parsed.ok) return parsed.res;
  const { email } = parsed.data;
  const rlEmail = await rateLimit(`magic:email:${email}`, 3, WINDOW);
  if (!rlEmail.ok) return tooManyRequests(rlEmail.retryAfter);

  let rawToken: string | undefined;
  try {
    const user = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, email: true, isSuperAdmin: true } });
    if (user && !user.isSuperAdmin) {
      rawToken = await issueOwnerLoginToken(prisma, user.id, "signin");
      await notify(ownerMagicLinkEmail({ userId: user.id, to: user.email, name: user.name, token: rawToken, baseUrl: appBaseUrl(req) }));
    }
  } catch (err) {
    logger.error("[auth] magic link error", { err });
  }
  const res: { ok: true; devToken?: string } = { ok: true };
  if (rawToken && testTokenHookEnabled()) res.devToken = rawToken;
  return NextResponse.json(res);
}

export const POST = safeRoute(POST_handler);
