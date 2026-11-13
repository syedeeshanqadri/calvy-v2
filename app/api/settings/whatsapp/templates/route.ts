import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { accessSession } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { parseBody } from "@/lib/validation/common";
import { rateLimit } from "@/lib/ratelimit";
import { whatsappTemplateActionSchema } from "@/lib/whatsapp/schemas";
import { whatsappPlanBlock } from "@/lib/whatsapp/access";
import { installTemplates, listCurrentTemplates, refreshTemplates } from "@/lib/whatsapp/store";
import { templateUrlBases } from "@/lib/whatsapp/urls";

export const dynamic = "force-dynamic";

async function POST_handler(req: NextRequest) {
  const session = await accessSession("owner");
  if (!session?.user?.businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const businessId = session.user.businessId;
  const blocked = await whatsappPlanBlock(businessId);
  if (blocked) return blocked;
  const parsed = await parseBody(req, whatsappTemplateActionSchema);
  if (!parsed.ok) return parsed.res;
  const rl = await rateLimit(`wa-templates:${businessId}`, 30, 60 * 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });

  let failures: string[] = [];
  let missing: string[] = [];
  if (parsed.data.action === "install") {
    const business = await prisma.business.findUnique({ where: { id: businessId }, select: { slug: true } });
    if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });
    const r = await installTemplates(businessId, templateUrlBases(business.slug));
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    failures = r.failures;
  } else {
    const r = await refreshTemplates(businessId);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    missing = r.missing;
  }
  const templates = await listCurrentTemplates(businessId);
  return NextResponse.json({ templates, failures, missing });
}

export const POST = safeRoute(POST_handler);
