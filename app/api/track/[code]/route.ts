import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { loadTracking } from "@/lib/trackingDb";
import { rateLimit, clientIp } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

// Public, no login: the signed code is the credential. Never cached; rate limited per IP (a clinic's
// waiting room shares one) and per code.
async function GET_handler(req: NextRequest, props: { params: Promise<{ code: string }> }) {
  const { code } = await props.params;
  const ip = await rateLimit(`track:${clientIp(req)}`, 120, 60_000);
  const perCode = await rateLimit(`track-code:${code.slice(0, 80)}`, 20, 60_000);
  if (!ip.ok || !perCode.ok) {
    const retryAfter = Math.max(ip.retryAfter, perCode.retryAfter);
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(retryAfter), "Cache-Control": "no-store" } });
  }
  const page = await loadTracking(code);
  // One answer for a bad signature and an unknown booking, so codes cannot be probed.
  if (!page) return NextResponse.json({ error: "This link is not valid." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json(page, { headers: { "Cache-Control": "no-store" } });
}

export const GET = safeRoute(GET_handler);
