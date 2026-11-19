import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseBody, text, id, emailField } from "@/lib/validation/common";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { notify } from "@/lib/notifications/enqueue";
import { requestMemberLink } from "@/lib/memberLink";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const schema = z.object({ email: emailField, businessSlug: text(80).min(1), serviceId: id.optional() });

/**
 * "Email me a sign-in link" at checkout. The answer is always the same ({ sent: true }) whether or not a member price exists for that
 * address, so this cannot be used to find out who is a member; the link only ever goes to the customer's own address. Rate limited per IP
 * and per address so it cannot be used to flood a mailbox.
 */
async function POST_handler(req: NextRequest) {
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.res;
  const { email, businessSlug, serviceId } = parsed.data;
  const ip = await rateLimit(`member-link:ip:${clientIp(req)}`, 5, 10 * 60_000);
  if (!ip.ok) return NextResponse.json({ error: "Too many tries. Please wait a few minutes." }, { status: 429, headers: { "Retry-After": String(ip.retryAfter) } });
  const mail = await rateLimit(`member-link:email:${email.toLowerCase()}`, 3, 60 * 60_000);
  if (!mail.ok) return NextResponse.json({ sent: true }); // quietly stop: nothing more is sent to this address this hour
  try {
    const r = await requestMemberLink(prisma, { email, businessSlug, service: serviceId ?? null, rootDomain: process.env.NEXT_PUBLIC_ROOT_DOMAIN || "calvy.io" });
    if (r.send) {
      await notify({
        event: "member.link", audience: "CUSTOMER", subjectId: r.send.to.toLowerCase(), version: String(Date.now()), recipient: r.send.to,
        template: "member_link", payload: { name: r.send.name }, secret: r.send.url,
      });
    }
  } catch (err) {
    logger.error("[MemberLink] could not send", { err });
  }
  return NextResponse.json({ sent: true });
}

export const POST = safeRoute(POST_handler);
