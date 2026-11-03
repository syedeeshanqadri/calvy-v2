import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { wizardOwner } from "@/lib/onboardingAuth";
import { checkSlug } from "@/lib/onboardingDb";
import { rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

/** Live availability check for the URL slug (format, reserved words, taken). Signed-in owners only. */
async function GET_handler(req: NextRequest) {
  const w = await wizardOwner();
  if (!w) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rl = await rateLimit(`slugcheck:${w.user.id}`, 60, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many checks. Please wait a moment." }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });
  const slug = (req.nextUrl.searchParams.get("slug") ?? "").slice(0, 80);
  const r = await checkSlug(slug, w.business.id);
  return NextResponse.json(r.ok ? { available: true, slug: r.slug } : { available: false, error: r.error });
}

export const GET = safeRoute(GET_handler);
