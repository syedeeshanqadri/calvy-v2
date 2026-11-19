import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { isValidLeadUnsubscribe } from "@/lib/onboardingReminders";

export const dynamic = "force-dynamic";

// Stop the onboarding reminders. POST is what mail apps send for one-click unsubscribe (RFC 8058) and what the confirmation page sends; the signature
// proves the link came from us for this lead. Opening it in a browser (GET) shows the confirmation page instead of doing anything.
async function POST_handler(req: NextRequest) {
  const limit = await rateLimit(`unsubscribe-onboarding:${clientIp(req)}`, 20, 60_000);
  if (!limit.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  const q = new URL(req.url).searchParams;
  const leadId = q.get("l") ?? "", sig = q.get("s") ?? "";
  if (!leadId || !isValidLeadUnsubscribe(leadId, sig)) return NextResponse.json({ error: "This link is not valid." }, { status: 400 });
  await prisma.lead.updateMany({ where: { id: leadId, unsubscribedAt: null }, data: { unsubscribedAt: new Date() } });
  return NextResponse.json({ ok: true });
}

async function GET_handler(req: NextRequest) {
  const url = new URL(req.url);
  return NextResponse.redirect(new URL(`/unsubscribe/onboarding${url.search}`, url));
}

export const POST = safeRoute(POST_handler);
export const GET = safeRoute(GET_handler);
