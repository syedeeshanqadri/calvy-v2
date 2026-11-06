import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { accessSession } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { parseBody } from "@/lib/validation/common";
import { paymentSettingsSchema } from "@/lib/paymentSettings";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** Online payment settings. Owner only (never a team permission): payment settings are an owner-only area. */
async function PATCH_handler(req: NextRequest) {
  const session = await accessSession("owner");
  if (!session?.user?.businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const businessId = session.user.businessId;

  const parsed = await parseBody(req, paymentSettingsSchema);
  if (!parsed.ok) return parsed.res;

  const data: { onlinePayMode?: "BOOKING_FEE_ONLY" | "FULL_ONLINE"; feePayer?: "CUSTOMER" | "BUSINESS" } = {};
  if (parsed.data.onlinePayMode) data.onlinePayMode = parsed.data.onlinePayMode;
  if (parsed.data.feePayer) data.feePayer = parsed.data.feePayer;

  const updated = await prisma.business.update({ where: { id: businessId }, data, select: { onlinePayMode: true, feePayer: true } });
  await audit({ businessId, actorId: session.user.id ?? "owner", action: "settings.payments_changed", detail: data });
  return NextResponse.json(updated);
}

export const PATCH = safeRoute(PATCH_handler);
