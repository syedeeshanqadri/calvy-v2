import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { notify } from "@/lib/notifications/enqueue";
import { authEmail } from "@/lib/notifications/events";
import { customerEmailSchema } from "@/lib/validation/customer";
import { readJsonBody, parseWith, tooManyRequests, testTokenHookEnabled, appBaseUrl } from "@/lib/auth-http";
import { issueCustomerToken } from "@/lib/customerDb";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const RESEND_COOLDOWN_MS = 60_000;

async function POST_handler(req: NextRequest) {
  const rlIp = await rateLimit(`customer-resend:ip:${clientIp(req)}`, 5, 15 * 60_000);
  if (!rlIp.ok) return tooManyRequests(rlIp.retryAfter);

  const body = await readJsonBody(req);
  if (!body.ok) return body.res;
  const parsed = parseWith(customerEmailSchema, body.data);
  if (!parsed.ok) return parsed.res;
  const { email } = parsed.data;

  const rlEmail = await rateLimit(`customer-resend:email:${email}`, 3, 60 * 60_000);
  if (!rlEmail.ok) return tooManyRequests(rlEmail.retryAfter);

  let rawToken: string | undefined;
  try {
    const customer = await prisma.customer.findUnique({ where: { email } });
    if (customer && !customer.emailVerified) {
      const latest = await prisma.customerToken.findFirst({ where: { customerId: customer.id, purpose: "verify" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
      if (!latest || Date.now() - latest.createdAt.getTime() >= RESEND_COOLDOWN_MS) {
        rawToken = await issueCustomerToken(prisma, customer.id, "verify");
        try {
          await notify(authEmail({ template: "customer_verification", userId: customer.id, to: customer.email, name: customer.name, token: rawToken, baseUrl: appBaseUrl(req) }));
        } catch (err) {
          logger.error("[customer] verification email failed", { err });
        }
      }
    }
  } catch (err) {
    logger.error("[customer] resend error", { err });
  }

  const res: { ok: true; devToken?: string } = { ok: true };
  if (rawToken && testTokenHookEnabled()) res.devToken = rawToken;
  return NextResponse.json(res);
}

export const POST = safeRoute(POST_handler);
