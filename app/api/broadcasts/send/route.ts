import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";
import { sendWhatsApp } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

let resendClient: Resend | null = null;
function getResend() {
  if (!resendClient) resendClient = new Resend(process.env.RESEND_API_KEY);
  return resendClient;
}
const FROM = process.env.EMAIL_FROM ?? "Calvy <onboarding@resend.dev>";

function buildEmailHtml(businessName: string, subject: string, message: string) {
  const escaped = message.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br/>");
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


export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const business = await prisma.business.findUnique({
    where: { ownerId: session.user.id },
    select: { id: true, name: true, plan: true, planStatus: true },
  });
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const isFree = business.plan === "free" || business.plan === "trial";
  if (isFree) return NextResponse.json({ error: "Upgrade to a paid plan to send broadcasts" }, { status: 403 });

  const { subject, message, medium } = await req.json() as {
    subject?: string;
    message: string;
    medium: "email" | "whatsapp" | "both";
  };

  if (!message?.trim()) return NextResponse.json({ error: "Message is required" }, { status: 400 });
  if ((medium === "email" || medium === "both") && !subject?.trim()) {
    return NextResponse.json({ error: "Subject is required for email" }, { status: 400 });
  }

  const clients = await prisma.client.findMany({
    where: { businessId: business.id },
    select: { email: true, phone: true, name: true },
  });

  let sentTo = 0;

  // ── Email ──────────────────────────────────────────────────────────────────
  if (medium === "email" || medium === "both") {
    const emailClients = clients.filter(c => c.email);
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
        console.error("[Broadcast] Email batch error:", err);
      }
    }
  }

  // ── WhatsApp ───────────────────────────────────────────────────────────────
  if (medium === "whatsapp" || medium === "both") {
    const waClients = clients.filter(c => c.phone);
    const results = await Promise.allSettled(
      waClients.map(c => sendWhatsApp(c.phone!, message))
    );
    sentTo += results.filter(r => r.status === "fulfilled" && r.value).length;
  }

  await prisma.broadcast.create({
    data: {
      businessId: business.id,
      subject: subject ?? null,
      message,
      medium,
      sentTo,
    },
  });

  return NextResponse.json({ ok: true, sentTo });
}
