import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseBody } from "@/lib/validation/common";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { isVerifiedBooker } from "@/lib/verifiedLimits";
import { progressFor } from "@/lib/rewards/service";

export const dynamic = "force-dynamic";

const schema = z.object({ email: z.string().email().max(254), verifiedTicket: z.string().max(800) });

/**
 * Does this verified customer have a free booking ready? Only an email proved by the customer's own signed link gets an answer,
 * so nobody can look up another person's progress by typing their address.
 */
async function POST_handler(req: NextRequest) {
  const rl = await rateLimit(`rewards-preview:${clientIp(req)}`, 30, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.res;
  const { email, verifiedTicket } = parsed.data;
  if (!(await isVerifiedBooker(prisma, [verifiedTicket], email))) return NextResponse.json({ reward: null });
  return NextResponse.json({ reward: await progressFor(prisma, { email }) });
}

export const POST = safeRoute(POST_handler);
