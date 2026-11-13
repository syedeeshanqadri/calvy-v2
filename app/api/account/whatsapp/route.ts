import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { accessSession } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { parseBody } from "@/lib/validation/common";
import { rateLimit } from "@/lib/ratelimit";
import { getBusinessFeatures } from "@/lib/getFeatures";
import { normalizeStaffPhone } from "@/lib/whatsapp/staff";
import { credentialsOf, usableLanguages } from "@/lib/whatsapp/store";
import { sendTemplateMessage } from "@/lib/whatsapp/graph";
import { templateName } from "@/lib/whatsapp/templates";
import { maskSecret } from "@/lib/whatsapp/signature";

export const dynamic = "force-dynamic";

/**
 * Your own WhatsApp number for business alerts. Personal: every owner or team member sets their own, and what they
 * receive follows their permissions (lib/whatsapp/staff.ts). Alerts need a verified number AND an explicit opt-in.
 */
async function view(businessId: string, userId: string) {
  const [cfg, user, limits] = await Promise.all([
    prisma.whatsAppConfig.findUnique({ where: { businessId }, select: { status: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { whatsappPhone: true, whatsappOptIn: true, whatsappVerifiedAt: true } }),
    getBusinessFeatures(businessId),
  ]);
  return {
    available: cfg?.status === "CONNECTED" && limits.whatsappReminders,
    phoneMasked: user?.whatsappPhone ? maskSecret(user.whatsappPhone.replace(/\D/g, "")) : null,
    verified: !!user?.whatsappVerifiedAt,
    optIn: !!user?.whatsappOptIn && !!user?.whatsappVerifiedAt,
  };
}

async function GET_handler() {
  const session = await accessSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await view(session.access.businessId, session.access.userId));
}

const sendSchema = z.object({ phone: z.string().trim().min(5).max(30) });

/** Save the number and send the connection-test template to it; "verified" means Meta accepted the message. */
async function POST_handler(req: NextRequest) {
  const session = await accessSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { businessId, userId } = session.access;
  const parsed = await parseBody(req, sendSchema);
  if (!parsed.ok) return parsed.res;
  const rl = await rateLimit(`wa-self-test:${userId}`, 5, 60 * 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many test messages. Try again later." }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });

  const [cfg, business] = await Promise.all([
    prisma.whatsAppConfig.findUnique({ where: { businessId } }),
    prisma.business.findUnique({ where: { id: businessId }, select: { name: true, timezone: true } }),
  ]);
  const v = await view(businessId, userId);
  if (!v.available || !cfg || !business) return NextResponse.json({ error: "WhatsApp is not connected for this business." }, { status: 400 });
  const phone = normalizeStaffPhone(parsed.data.phone, business.timezone);
  if (!phone) return NextResponse.json({ error: "That does not look like a phone number. Include the country code." }, { status: 400 });

  const approved = await usableLanguages(businessId, templateName("connection_test"));
  const language = approved.includes("en") ? "en" : approved[0];
  if (!language) return NextResponse.json({ error: "The test template is not approved yet. Ask the owner to check Settings > WhatsApp." }, { status: 409 });

  const r = await sendTemplateMessage(credentialsOf(cfg), phone.replace(/\D/g, ""), { name: templateName("connection_test"), language, params: [business.name] });
  if (!r.ok) return NextResponse.json({ error: r.reason }, { status: 502 });
  // A new number starts with alerts off; the person turns them on after the test message arrives.
  await prisma.user.update({ where: { id: userId }, data: { whatsappPhone: phone, whatsappVerifiedAt: new Date(), whatsappOptIn: false } });
  return NextResponse.json(await view(businessId, userId));
}

const optSchema = z.object({ optIn: z.boolean() });

async function PUT_handler(req: NextRequest) {
  const session = await accessSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { businessId, userId } = session.access;
  const parsed = await parseBody(req, optSchema);
  if (!parsed.ok) return parsed.res;
  const v = await view(businessId, userId);
  if (parsed.data.optIn && !(v.available && v.verified)) return NextResponse.json({ error: "Send yourself the test message first." }, { status: 400 });
  await prisma.user.update({ where: { id: userId }, data: { whatsappOptIn: parsed.data.optIn } });
  return NextResponse.json(await view(businessId, userId));
}

async function DELETE_handler() {
  const session = await accessSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await prisma.user.update({ where: { id: session.access.userId }, data: { whatsappPhone: null, whatsappVerifiedAt: null, whatsappOptIn: false } });
  return NextResponse.json(await view(session.access.businessId, session.access.userId));
}

export const GET = safeRoute(GET_handler);
export const POST = safeRoute(POST_handler);
export const PUT = safeRoute(PUT_handler);
export const DELETE = safeRoute(DELETE_handler);
