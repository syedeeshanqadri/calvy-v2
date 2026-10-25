import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { sendCustomerPasswordResetEmail } from "@/lib/email";
import { customerEmailSchema } from "@/lib/validation/customer";
import { readJsonBody, parseWith, tooManyRequests, testTokenHookEnabled, appBaseUrl } from "@/lib/auth-http";
import { issueCustomerToken } from "@/lib/customerDb";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const WINDOW = 15 * 60_000;

// Same shape and limits as the owner reset: the answer never says whether the email has an account.
async function POST_handler(req: NextRequest) {
  const rlIp = await rateLimit(`customer-forgot:ip:${clientIp(req)}`, 5, WINDOW);
  if (!rlIp.ok) return tooManyRequests(rlIp.retryAfter);

  const body = await readJsonBody(req);
  if (!body.ok) return body.res;
  const parsed = parseWith(customerEmailSchema, body.data);
  if (!parsed.ok) return parsed.res;
  const { email } = parsed.data;

  const rlEmail = await rateLimit(`customer-forgot:email:${email}`, 3, WINDOW);
  if (!rlEmail.ok) return tooManyRequests(rlEmail.retryAfter);

  let rawToken: string | undefined;
  try {
    const customer = await prisma.customer.findUnique({ where: { email } });
    if (customer) {
      rawToken = await issueCustomerToken(prisma, customer.id, "reset");
      try {
        await sendCustomerPasswordResetEmail({ to: customer.email, name: customer.name, token: rawToken, baseUrl: appBaseUrl(req) });
      } catch (err) {
        logger.error("[customer] reset email failed", { err });
      }
    }
  } catch (err) {
    logger.error("[customer] forgot-password error", { err });
  }

  const res: { ok: true; devToken?: string } = { ok: true };
  if (rawToken && testTokenHookEnabled()) res.devToken = rawToken;
  return NextResponse.json(res);
}

export const POST = safeRoute(POST_handler);
