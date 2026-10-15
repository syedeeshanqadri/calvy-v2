import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { sendVerificationEmail } from "@/lib/email";
import { resendVerificationSchema } from "@/lib/validation/auth";
import { generateToken, tokenExpiry, VERIFY_TOKEN_TTL_MS } from "@/lib/auth-tokens";
import { readJsonBody, parseWith, tooManyRequests, testTokenHookEnabled } from "@/lib/auth-http";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const rlIp = await rateLimit(`resend:ip:${clientIp(req)}`, 5, 15 * 60_000);
  if (!rlIp.ok) return tooManyRequests(rlIp.retryAfter);

  const body = await readJsonBody(req);
  if (!body.ok) return body.res;
  const parsed = parseWith(resendVerificationSchema, body.data);
  if (!parsed.ok) return parsed.res;
  const { email } = parsed.data;

  const rlEmail = await rateLimit(`resend:email:${email}`, 3, 60 * 60_000);
  if (!rlEmail.ok) return tooManyRequests(rlEmail.retryAfter);

  let rawToken: string | undefined;
  try {
    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      orderBy: { createdAt: "asc" },
    });
    if (user && !user.emailVerified) {
      const token = generateToken();
      await prisma.$transaction([
        prisma.verificationToken.deleteMany({ where: { email: user.email } }),
        prisma.verificationToken.create({
          data: { token, email: user.email, expiresAt: tokenExpiry(VERIFY_TOKEN_TTL_MS) },
        }),
      ]);
      rawToken = token;
      try {
        await sendVerificationEmail({ to: user.email, name: user.name, token });
      } catch (err) {
        console.error("[auth] verification email failed", err instanceof Error ? err.message : "unknown");
      }
    }
  } catch (err) {
    console.error("[auth] resend-verification error", err instanceof Error ? err.message : "unknown");
  }

  const res: { ok: true; devToken?: string } = { ok: true };
  if (rawToken && testTokenHookEnabled()) res.devToken = rawToken;
  return NextResponse.json(res);
}
