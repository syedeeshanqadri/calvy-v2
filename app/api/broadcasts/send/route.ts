import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseBody } from "@/lib/validation/common";
import { broadcastSchema } from "@/lib/validation/misc";
import { Resend } from "resend";
import { getBusinessFeatures } from "@/lib/getFeatures";
import { rateLimit } from "@/lib/ratelimit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

let resendClient: Resend | null = null;
function getResend() {
  if (!resendClient) resendClient = new Resend(process.env.RESEND_API_KEY);
  return resendClient;
}
const MAX_RECIPIENTS = 500;
const FROM = process.env.EMAIL_FROM ?? "Calvy <onboarding@resend.dev>";

const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function buildEmailHtml(rawBusinessName: string, rawSubject: string, message: string) {
  const businessName = esc(rawBusinessName);
  const subject = esc(rawSubject);
  const escaped = esc(message).replace(/\n/g, "<br/>");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body style="margin:0;padding:0;background:#f5f5f7;font-family:system-ui,-apple-system,sans-serif;">
<div style="max-width:560px;margin:40px auto;padding:0 16px;">
  <div style="background:#fff;border-radius:20px;padding:36px;border:1px solid #e8e6e0;">
    <p style="font-size:13px;font-weight:600;color:#0284c7;margin:0 0 8px;text-transform:uppercase;letter-spacing:.05em;">${businessName}</p>
    <h1 style="font-size:22px;font-weight:700;color:#0f0f1a;margin:0 0 20px;line-height:1.3;">${subject}</h1>
    <div style="font-size:15px;color:#3d3d4d;line-height:1.7;">${escaped}</div>
  </div>
  <p style="font-size:12px;color:#aaa;text-align:center;margin-top:20px;">
    You received this as a client of <strong>${businessName}</strong>. Sent via Calvy.
  </p>
</div></body></html>`;
}


async function POST_handler(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const business = await prisma.business.findUnique({
    where: { ownerId: session.user.id },
    select: { id: true, name: true, plan: true, planStatus: true },
  });
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const isFree = business.plan === "free" || business.plan === "trial";
  if (isFree) return NextResponse.json({ error: "Upgrade to a paid plan to send broadcasts" }, { status: 403 });

  const parsed = await parseBody(req, broadcastSchema);
  if (!parsed.ok) return parsed.res;
  const { subject, message } = parsed.data;

  // Plan limits come from PlanConfig (admin-editable), not hard-coded plan names.
  const limits = await getBusinessFeatures(business.id);
  if (!limits.broadcasts || limits.maxBroadcastsPerMonth === 0) {
    return NextResponse.json({ error: "Broadcasts are not available on your plan" }, { status: 403 });
  }
  if (limits.maxBroadcastsPerMonth > 0) {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const sentThisMonth = await prisma.broadcast.count({
      where: { businessId: business.id, createdAt: { gte: monthStart } },
    });
    if (sentThisMonth >= limits.maxBroadcastsPerMonth) {
      return NextResponse.json(
        { error: `Monthly broadcast limit (${limits.maxBroadcastsPerMonth}) reached. Upgrade your plan.`, code: "LIMIT_REACHED" },
        { status: 402 },
      );
    }
  }

  // Burst guard on top of the monthly cap.
  const rl = await rateLimit(`broadcast:${business.id}`, 3, 60 * 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many broadcasts. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  // Safe batch size: one request never fans out to more than MAX_RECIPIENTS clients.
  const clients = await prisma.client.findMany({
    where: { businessId: business.id },
    select: { email: true, phone: true, name: true },
    orderBy: { createdAt: "asc" },
    take: MAX_RECIPIENTS + 1,
  });
  const capped = clients.length > MAX_RECIPIENTS;
  if (capped) clients.length = MAX_RECIPIENTS;

  let sentTo = 0;

  // ── Email ──────────────────────────────────────────────────────────────────
  {
    const emailClients = clients.filter((c): c is typeof c & { email: string } => !!c.email);
    const html = buildEmailHtml(business.name, subject!, message);

    // Resend batch API: max 100 per call
    const CHUNK = 100;
    for (let i = 0; i < emailClients.length; i += CHUNK) {
      const chunk = emailClients.slice(i, i + CHUNK);
      const emails = chunk.map(c => ({
        from: FROM,
        to: c.email,
        subject: subject!,
        html,
      }));
      try {
        await getResend().batch.send(emails);
        sentTo += chunk.length;
      } catch (err) {
        logger.error("broadcast email batch failed", { err });
      }
    }
  }

  await prisma.broadcast.create({
    data: {
      businessId: business.id,
      subject: subject ?? null,
      message,
      medium: "email",
      sentTo,
    },
  });

  return NextResponse.json({ ok: true, sentTo, ...(capped ? { capped: true, limit: MAX_RECIPIENTS } : {}) });
}

export const POST = safeRoute(POST_handler);
