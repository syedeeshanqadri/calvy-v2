import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { safeRoute } from "@/lib/api";
import { rateLimit } from "@/lib/ratelimit";
import { resendFailed } from "@/lib/notifications/log";

export const dynamic = "force-dynamic";

/** Owner: resend one failed message of their own business (delivery log, chunk 6). */
async function POST_handler(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const businessId = session?.user?.kind !== "customer" ? session?.user?.businessId : undefined;
  if (!businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!id || id.length > 64) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const limit = await rateLimit(`notif-resend:${businessId}`, 20, 3_600_000);
  if (!limit.ok) return NextResponse.json({ error: "Too many resends, try again later" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  const result = await resendFailed(id, businessId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.code });
  return NextResponse.json(result);
}

export const POST = safeRoute(POST_handler);
