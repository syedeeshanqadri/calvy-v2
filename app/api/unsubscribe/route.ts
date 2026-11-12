import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { isValidUnsubscribe } from "@/lib/notifications/prefs";
import { parseUnsubscribeParams } from "@/lib/notifications/unsubscribe";
import { stopWhatsAppFor } from "@/lib/whatsapp/optout";

export const dynamic = "force-dynamic";

// The signed link in an optional email (thank-you messages and, later, reminders and review requests).
// POST is what mail apps send for one-click unsubscribe (RFC 8058) and what the confirmation page sends.
// The signature proves the link came from us for this exact business and address; it is public otherwise.
async function POST_handler(req: NextRequest) {
  const limit = await rateLimit(`unsubscribe:${clientIp(req)}`, 20, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  }
  const link = parseUnsubscribeParams(new URL(req.url).searchParams, isValidUnsubscribe);
  if (!link) return NextResponse.json({ error: "This link is not valid." }, { status: 400 });

  if (new URL(req.url).searchParams.get("ch") === "wa") {
    await stopWhatsAppFor(link.businessId, link.recipient);
    return NextResponse.json({ ok: true });
  }

  await prisma.notificationOptOut.upsert({
    where: { businessId_recipient: { businessId: link.businessId, recipient: link.recipient } },
    create: { businessId: link.businessId, recipient: link.recipient },
    update: {},
  });
  return NextResponse.json({ ok: true });
}

// Mail apps and people may open the link instead: show the page, which asks before doing anything.
function GET_handler(req: NextRequest) {
  const url = new URL(req.url);
  return NextResponse.redirect(new URL(`/unsubscribe${url.search}`, url));
}

export const POST = safeRoute(POST_handler);
export const GET = GET_handler;
