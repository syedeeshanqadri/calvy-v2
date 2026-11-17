import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { accessSession } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { parseBody } from "@/lib/validation/common";
import { rateLimit } from "@/lib/ratelimit";
import { whatsappSaveSchema } from "@/lib/whatsapp/schemas";
import { whatsappPlanBlock } from "@/lib/whatsapp/access";
import { disconnectEmbedded } from "@/lib/whatsapp/embedded";
import { deleteConfig, listCurrentTemplates, publicView, saveConfig } from "@/lib/whatsapp/store";

export const dynamic = "force-dynamic";

/** Everything here is owner-only: WhatsApp credentials are never a team permission. */
async function GET_handler() {
  const session = await accessSession("owner");
  if (!session?.user?.businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const businessId = session.user.businessId;
  const blocked = await whatsappPlanBlock(businessId);
  if (blocked) return blocked;
  const [config, templates] = await Promise.all([prisma.whatsAppConfig.findUnique({ where: { businessId } }), listCurrentTemplates(businessId)]);
  return NextResponse.json({ config: publicView(config), templates });
}

async function PUT_handler(req: NextRequest) {
  const session = await accessSession("owner");
  if (!session?.user?.businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const businessId = session.user.businessId;
  const blocked = await whatsappPlanBlock(businessId);
  if (blocked) return blocked;
  const rl = await rateLimit(`wa-save:${businessId}`, 20, 60 * 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });
  const parsed = await parseBody(req, whatsappSaveSchema);
  if (!parsed.ok) return parsed.res;
  const current = await prisma.whatsAppConfig.findUnique({ where: { businessId }, select: { source: true } });
  if (current?.source === "EMBEDDED") return NextResponse.json({ error: "This number is connected through Calvy. Disconnect it first to enter credentials manually." }, { status: 400 });
  const r = await saveConfig(businessId, parsed.data);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ config: publicView(await prisma.whatsAppConfig.findUnique({ where: { businessId } })) });
}

async function DELETE_handler() {
  const session = await accessSession("owner");
  if (!session?.user?.businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const businessId = session.user.businessId;
  const c = await prisma.whatsAppConfig.findUnique({ where: { businessId }, select: { source: true } });
  // Calvy-connected: unsubscribe our app from the WABA, then delete the tokens. Manual: just delete.
  if (c?.source === "EMBEDDED") return NextResponse.json({ ok: true, ...(await disconnectEmbedded(businessId)) });
  await deleteConfig(businessId);
  return NextResponse.json({ ok: true });
}

export const GET = safeRoute(GET_handler);
export const PUT = safeRoute(PUT_handler);
export const DELETE = safeRoute(DELETE_handler);
