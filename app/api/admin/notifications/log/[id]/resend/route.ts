import { NextRequest, NextResponse } from "next/server";
import { safeRoute } from "@/lib/api";
import { requireAdminApi } from "@/lib/admin/auth";
import { rateLimit } from "@/lib/ratelimit";
import { logger } from "@/lib/logger";
import { resendFailed } from "@/lib/notifications/log";

export const dynamic = "force-dynamic";

/** Super-admin: resend one failed message of any business or the platform (delivery log, chunk 6). */
async function POST_handler(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminApi();
  if (!gate.ok) return gate.res;
  const { id } = await params;
  if (!id || id.length > 64) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const limit = await rateLimit(`notif-resend:admin:${gate.ctx.user.id}`, 60, 3_600_000);
  if (!limit.ok) return NextResponse.json({ error: "Too many resends, try again later" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  const result = await resendFailed(id, undefined);
  logger.info("admin notification resend", { id, by: gate.ctx.user.id, ok: result.ok });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.code });
  return NextResponse.json(result);
}

export const POST = safeRoute(POST_handler);
