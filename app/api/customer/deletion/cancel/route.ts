import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseBody } from "@/lib/validation/common";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { cancelDeletion } from "@/lib/accountDeletion";

export const dynamic = "force-dynamic";

/** The cancel link in the confirmation email: the secret token is the proof, so no sign-in is needed. One use; only a pending request. */
async function POST_handler(req: NextRequest) {
  const rl = await rateLimit(`deletion-cancel:${clientIp(req)}`, 10, 10 * 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many tries." }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });
  const parsed = await parseBody(req, z.object({ token: z.string().max(100) }));
  if (!parsed.ok) return parsed.res;
  const ok = await cancelDeletion(prisma, { token: parsed.data.token }, "customer:email-link");
  return NextResponse.json({ ok });
}

export const POST = safeRoute(POST_handler);
