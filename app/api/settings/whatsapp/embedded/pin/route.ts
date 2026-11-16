import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { accessSession } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { parseBody } from "@/lib/validation/common";
import { rateLimit } from "@/lib/ratelimit";
import { whatsappPlanBlock } from "@/lib/whatsapp/access";
import { finishWithPin } from "@/lib/whatsapp/embedded";
import { connectResponse } from "@/lib/whatsapp/embeddedResponse";
import { templateUrlBases } from "@/lib/whatsapp/urls";

export const dynamic = "force-dynamic";

const schema = z.object({ pin: z.string().trim().regex(/^\d{6}$/, "The PIN is 6 digits") });

/** The number already has two-step verification: register it with the owner's existing PIN. The PIN is never echoed or logged. */
async function POST_handler(req: NextRequest) {
  const session = await accessSession("owner");
  if (!session?.user?.businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const businessId = session.user.businessId;
  const blocked = await whatsappPlanBlock(businessId);
  if (blocked) return blocked;
  const rl = await rateLimit(`wa-pin:${businessId}`, 10, 60 * 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.res;
  const business = await prisma.business.findUnique({ where: { id: businessId }, select: { slug: true } });
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });
  return connectResponse(businessId, await finishWithPin(businessId, parsed.data.pin, templateUrlBases(business.slug)));
}

export const POST = safeRoute(POST_handler);
