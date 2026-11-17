import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { accessSession } from "@/lib/access";
import { parseBody } from "@/lib/validation/common";
import { audit } from "@/lib/audit";
import { scheduleChange } from "@/lib/subscriptions/service";

export const dynamic = "force-dynamic";

const schema = z.object({ action: z.enum(["cancel", "downgrade", "undo"]), planId: z.enum(["professional", "business"]).optional(), interval: z.enum(["MONTHLY", "YEARLY"]).optional() });

/** Downgrade, cancel or undo a scheduled change. All of them take effect at the end of the paid period. Owner only. */
async function POST_handler(req: NextRequest) {
  const session = await accessSession("owner");
  if (!session?.user?.businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.res;
  const r = await scheduleChange({ businessId: session.user.businessId, ...parsed.data });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  await audit({ businessId: session.user.businessId, actorId: session.user.id ?? "owner", action: "subscription.changed", detail: parsed.data });
  return NextResponse.json({ ok: true });
}

export const POST = safeRoute(POST_handler);
