import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { resetPasswordSchema } from "@/lib/validation/auth";
import { readJsonBody, parseWith, tooManyRequests } from "@/lib/auth-http";
import { acceptInvite } from "@/lib/teamDb";

export const dynamic = "force-dynamic";

const INVALID = "This invitation is invalid or has expired.";

async function POST_handler(req: NextRequest) {
  const rl = await rateLimit(`team-accept:ip:${clientIp(req)}`, 10, 15 * 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);
  const body = await readJsonBody(req);
  if (!body.ok) return body.res;
  const parsed = parseWith(resetPasswordSchema, body.data);
  if (!parsed.ok) return parsed.paths.includes("token") ? NextResponse.json({ error: INVALID }, { status: 400 }) : parsed.res;
  const r = await acceptInvite(parsed.data.token, parsed.data.password);
  if (!r.ok) return NextResponse.json({ error: INVALID }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export const POST = safeRoute(POST_handler);
