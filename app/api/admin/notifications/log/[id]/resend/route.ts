import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { safeRoute } from "@/lib/api";
import { isAdminUser } from "@/lib/adminAuth";
import { rateLimit } from "@/lib/ratelimit";
import { logger } from "@/lib/logger";
import { resendFailed } from "@/lib/notifications/log";

export const dynamic = "force-dynamic";

/** Super-admin: resend one failed message of any business or the platform (delivery log, chunk 6). */
async function POST_handler(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isAdminUser(session?.user)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!id || id.length > 64) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const limit = await rateLimit(`notif-resend:admin:${session?.user?.id ?? "admin"}`, 60, 3_600_000);
  if (!limit.ok) return NextResponse.json({ error: "Too many resends, try again later" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  const result = await resendFailed(id, undefined);
  logger.info("admin notification resend", { id, by: session?.user?.id, ok: result.ok });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.code });
  return NextResponse.json(result);
}

export const POST = safeRoute(POST_handler);
