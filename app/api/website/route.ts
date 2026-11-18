import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { accessSession } from "@/lib/access";
import { prisma } from "@/lib/prisma";

import { revalidateSite } from "@/lib/revalidateSite";
import { parseBody } from "@/lib/validation/common";

import { websitePatchSchema } from "@/lib/validation/misc";
import { checkLimit, denialResponse } from "@/lib/limits";
import { hiddenInWebsiteJson } from "@/lib/calvyBadge";

export const dynamic = "force-dynamic";

async function PATCH_handler(req: NextRequest) {
  const session = await accessSession("website.edit");
  if (!session?.user?.businessId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = await parseBody(req, websitePatchSchema);
  if (!parsed.ok) return parsed.res;
  const { websiteJson } = parsed.data;

  // Hiding the "Bookings by Calvy" footer is plan-gated here as well as in the editor.
  if (hiddenInWebsiteJson(websiteJson)) {
    const denied = await checkLimit(session.user.businessId, "branding", { owner: true });
    if (denied) return denialResponse(denied);
  }

  await prisma.business.update({
    where: { id: session.user.businessId },
    data: { websiteJson },
  });

  await revalidateSite(session.user.businessId);
  return NextResponse.json({ ok: true });
}

export const PATCH = safeRoute(PATCH_handler);
