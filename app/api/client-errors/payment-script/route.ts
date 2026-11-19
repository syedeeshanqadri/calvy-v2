import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/validation/common";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const schema = z.object({
  reference: z.string().regex(/^PAY-[A-Z0-9]{6}$/),
  kind: z.enum(["blocked", "network", "not_started"]),
  provider: z.string().max(30),
  host: z.string().max(80),
  page: z.string().max(120),
});

/**
 * The browser could not load a payment gateway's checkout script. Logs the reference the customer was shown, what failed and on which page, so
 * support can find it. Public by design (a customer may not be signed in): strictly validated, small, rate limited, and it stores nothing.
 */
async function POST_handler(req: NextRequest) {
  const rl = await rateLimit(`payment-script-error:${clientIp(req)}`, 20, 10 * 60_000);
  if (!rl.ok) return NextResponse.json({ ok: false }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.res;
  logger.error("[Payments] the payment page could not be loaded in the browser", { ...parsed.data, userAgent: (req.headers.get("user-agent") ?? "").slice(0, 160) });
  return NextResponse.json({ ok: true });
}

export const POST = safeRoute(POST_handler);
