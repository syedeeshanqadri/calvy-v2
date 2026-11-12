import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { accessSession } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { parseBody } from "@/lib/validation/common";
import { rateLimit } from "@/lib/ratelimit";
import { normalizePhone } from "@/lib/phone";
import { whatsappTestSchema } from "@/lib/whatsapp/schemas";
import { whatsappPlanBlock } from "@/lib/whatsapp/access";
import { credentialsOf } from "@/lib/whatsapp/store";
import { sendTemplateMessage } from "@/lib/whatsapp/graph";
import { templateName } from "@/lib/whatsapp/templates";

export const dynamic = "force-dynamic";

/** Sends the approved connection-test template to a number the owner types. Nothing is logged but the outcome. */
async function POST_handler(req: NextRequest) {
  const session = await accessSession("owner");
  if (!session?.user?.businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const businessId = session.user.businessId;
  const blocked = await whatsappPlanBlock(businessId);
  if (blocked) return blocked;
  const parsed = await parseBody(req, whatsappTestSchema);
  if (!parsed.ok) return parsed.res;
  const rl = await rateLimit(`wa-test:${businessId}`, 10, 60 * 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many test messages. Try again later." }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });

  const [cfg, business] = await Promise.all([
    prisma.whatsAppConfig.findUnique({ where: { businessId } }),
    prisma.business.findUnique({ where: { id: businessId }, select: { name: true, timezone: true } }),
  ]);
  if (!cfg || cfg.status !== "CONNECTED" || !business) return NextResponse.json({ error: "Connect and verify WhatsApp first." }, { status: 400 });
  const phone = normalizePhone(parsed.data.to, business.timezone);
  if (!phone) return NextResponse.json({ error: "That does not look like a phone number. Include the country code." }, { status: 400 });

  const approved = await prisma.whatsAppTemplate.findMany({ where: { businessId, name: templateName("connection_test"), status: "APPROVED" }, select: { language: true } });
  const language = approved.find((t) => t.language === "en")?.language ?? approved[0]?.language;
  if (!language) return NextResponse.json({ error: "The test template is not approved yet. Install templates and wait for Meta's approval.", code: "NO_APPROVED_TEMPLATE" }, { status: 409 });

  const r = await sendTemplateMessage(credentialsOf(cfg), phone.replace(/\D/g, ""), { name: templateName("connection_test"), language, params: ["there", business.name] });
  if (!r.ok) return NextResponse.json({ error: r.reason }, { status: 502 });
  return NextResponse.json({ ok: true });
}

export const POST = safeRoute(POST_handler);
