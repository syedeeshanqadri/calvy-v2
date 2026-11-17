import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { accessSession } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { parseBody } from "@/lib/validation/common";
import { rateLimit } from "@/lib/ratelimit";
import { whatsappPlanBlock } from "@/lib/whatsapp/access";
import { connectEmbedded, metaEnv } from "@/lib/whatsapp/embedded";
import { connectResponse } from "@/lib/whatsapp/embeddedResponse";
import { templateUrlBases } from "@/lib/whatsapp/urls";

export const dynamic = "force-dynamic";

const id = z.string().trim().regex(/^\d{5,25}$/);
const schema = z.object({
  code: z.string().trim().min(5).max(2000),
  wabaId: id,
  phoneNumberId: id,
  coexistence: z.boolean().default(false),
  pin: z.string().trim().regex(/^\d{6}$/, "The PIN is 6 digits").optional(),
});

/** Owner only, Mid+ plan (whatsappReminders, enforcement inside getBusinessFeatures). Receives the code and ids from the browser's FB.login. */
async function POST_handler(req: NextRequest) {
  const session = await accessSession("owner");
  if (!session?.user?.businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const businessId = session.user.businessId;
  const blocked = await whatsappPlanBlock(businessId);
  if (blocked) return blocked;
  const env = metaEnv();
  if (!env) return NextResponse.json({ error: "Connect WhatsApp is not set up on this server yet." }, { status: 503 });
  const rl = await rateLimit(`wa-embedded:${businessId}`, 10, 60 * 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.res;
  const business = await prisma.business.findUnique({ where: { id: businessId }, select: { slug: true } });
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });
  return connectResponse(businessId, await connectEmbedded(businessId, parsed.data, templateUrlBases(business.slug), env));
}

export const POST = safeRoute(POST_handler);
