import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sendFormNotification } from "@/lib/email";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { parseBody } from "@/lib/validation/common";

export const dynamic = "force-dynamic";

const clean = (max: number) => z.string().trim().max(max).transform((v) => v.replace(/[\r\n]+/g, " "));
const schema = z.object({
  name: clean(120).pipe(z.string().min(1)),
  email: z.string().trim().toLowerCase().email().max(254),
  role: z.enum(["owner", "team", "customer"]),
  message: z.string().trim().max(1000).optional(),
});

/**
 * Public "delete my data" request. It only tells the support inbox; nothing is deleted here. We reply to the address given
 * and confirm it is really the account holder before acting, so a request made for someone else's address changes nothing.
 * Nothing is sent to the address typed in the form (no way to use this to mail strangers).
 */
async function POST_handler(req: NextRequest) {
  const rl = await rateLimit(`data-deletion:${clientIp(req)}`, 3, 60 * 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.res;
  const d = parsed.data;
  await sendFormNotification({
    title: "Data deletion request",
    fields: { Name: d.name, Email: d.email, Role: d.role, Message: d.message },
  });
  return NextResponse.json({ ok: true });
}

export const POST = safeRoute(POST_handler);
