import { safeRoute } from "@/lib/api";
import { NextResponse } from "next/server";
import { accessSession } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/ratelimit";
import { whatsappPlanBlock } from "@/lib/whatsapp/access";
import { publicView, verifyAndStore } from "@/lib/whatsapp/store";

export const dynamic = "force-dynamic";

async function POST_handler() {
  const session = await accessSession("owner");
  if (!session?.user?.businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const businessId = session.user.businessId;
  const blocked = await whatsappPlanBlock(businessId);
  if (blocked) return blocked;
  const rl = await rateLimit(`wa-verify:${businessId}`, 20, 60 * 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });
  const out = await verifyAndStore(businessId);
  if (!out) return NextResponse.json({ error: "Save your WhatsApp details first." }, { status: 400 });
  return NextResponse.json({ ok: out.ok, config: publicView(await prisma.whatsAppConfig.findUnique({ where: { businessId } })) });
}

export const POST = safeRoute(POST_handler);
