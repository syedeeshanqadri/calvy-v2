import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { sendCustomerVerificationEmail } from "@/lib/email";
import { customerSignupSchema } from "@/lib/validation/customer";
import { readJsonBody, parseWith, tooManyRequests, testTokenHookEnabled, appBaseUrl } from "@/lib/auth-http";
import { issueCustomerToken } from "@/lib/customerDb";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/** A new link is not sent while the newest one is younger than this. */
const RESEND_COOLDOWN_MS = 60_000;

// Optional customer account. The answer is the same whether or not the email already has an account,
// so this cannot be used to find out who is registered. Nothing is shown to anyone until the emailed
// link proves they own the address.
async function POST_handler(req: NextRequest) {
  const rlIp = await rateLimit(`customer-signup:ip:${clientIp(req)}`, 5, 15 * 60_000);
  if (!rlIp.ok) return tooManyRequests(rlIp.retryAfter);

  const body = await readJsonBody(req);
  if (!body.ok) return body.res;
  const parsed = parseWith(customerSignupSchema, body.data);
  if (!parsed.ok) return parsed.res;
  const { name, email, password } = parsed.data;

  const rlEmail = await rateLimit(`customer-signup:email:${email}`, 3, 60 * 60_000);
  if (!rlEmail.ok) return tooManyRequests(rlEmail.retryAfter);

  let rawToken: string | undefined;
  try {
    const existing = await prisma.customer.findUnique({ where: { email } });
    // A verified account is never touched. An unverified one takes the new details and gets a fresh
    // link, at most once a minute.
    let target = existing;
    const hashed = await bcrypt.hash(password, 12);
    if (!existing) target = await prisma.customer.create({ data: { name, email, password: hashed } });
    // Not verified yet: the latest signup wins, so someone who signed up with another person's email
    // cannot keep the password the real owner would be verifying under.
    else if (!existing.emailVerified) target = await prisma.customer.update({ where: { id: existing.id }, data: { name, password: hashed } });
    if (target && !target.emailVerified) {
      const latest = await prisma.customerToken.findFirst({ where: { customerId: target.id, purpose: "verify" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
      if (!latest || Date.now() - latest.createdAt.getTime() >= RESEND_COOLDOWN_MS) {
        rawToken = await issueCustomerToken(prisma, target.id, "verify");
        try {
          await sendCustomerVerificationEmail({ to: target.email, name: target.name, token: rawToken, baseUrl: appBaseUrl(req) });
        } catch (err) {
          logger.error("[customer] verification email failed", { err });
        }
      }
    }
  } catch (err) {
    logger.error("[customer] signup error", { err });
  }

  const res: { ok: true; devToken?: string } = { ok: true };
  if (rawToken && testTokenHookEnabled()) res.devToken = rawToken;
  return NextResponse.json(res, { status: 201 });
}

export const POST = safeRoute(POST_handler);
