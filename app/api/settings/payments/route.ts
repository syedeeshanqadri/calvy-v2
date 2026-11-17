import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { accessSession } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { parseBody } from "@/lib/validation/common";
import { audit } from "@/lib/audit";
import { gatewayPlanBlock } from "@/lib/payments/access";

export const dynamic = "force-dynamic";

const optionFields = {
  payOption: z.enum(["VENUE", "ONLINE_FULL", "ADVANCE"]),
  advanceKind: z.enum(["PERCENT", "FIXED"]),
  // PERCENT: 1-100. FIXED: minor units (paise).
  advanceValue: z.number().int().min(1).max(10_000_000),
};

const schema = z.object({
  ...optionFields,
  advanceKind: optionFields.advanceKind.default("PERCENT"),
  advanceValue: optionFields.advanceValue.default(30),
  /** Per-service overrides: service id -> option, or null to follow the business setting. */
  services: z.record(z.string().max(64), z.object({ payOption: optionFields.payOption.nullable(), advanceKind: optionFields.advanceKind.optional(), advanceValue: optionFields.advanceValue.optional() })).optional(),
}).refine((v) => v.payOption !== "ADVANCE" || v.advanceKind !== "PERCENT" || v.advanceValue <= 100, { message: "A percentage cannot be more than 100.", path: ["advanceValue"] });

/** What customers pay online through the business's own gateway. Owner only, Mid/Top plans. */
async function PATCH_handler(req: NextRequest) {
  const session = await accessSession("owner");
  if (!session?.user?.businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const businessId = session.user.businessId;
  const blocked = await gatewayPlanBlock(businessId);
  if (blocked) return blocked;
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.res;
  const d = parsed.data;

  // Taking money online needs a connected, enabled default gateway to send it to.
  if (d.payOption !== "VENUE" || Object.values(d.services ?? {}).some((s) => s.payOption && s.payOption !== "VENUE")) {
    const gw = await prisma.paymentGateway.count({ where: { businessId, enabled: true, isDefault: true, status: "CONNECTED" } });
    if (!gw) return NextResponse.json({ error: "Connect and verify a payment gateway first, then choose online payment." }, { status: 409 });
  }
  const updated = await prisma.business.update({ where: { id: businessId }, data: { payOption: d.payOption, advanceKind: d.advanceKind, advanceValue: d.advanceValue }, select: { payOption: true, advanceKind: true, advanceValue: true } });
  for (const [serviceId, o] of Object.entries(d.services ?? {})) {
    await prisma.service.updateMany({
      where: { id: serviceId, businessId },
      data: o.payOption === null ? { payOption: null, advanceKind: null, advanceValue: null } : { payOption: o.payOption, advanceKind: o.advanceKind ?? "PERCENT", advanceValue: o.advanceValue ?? 30 },
    });
  }
  await audit({ businessId, actorId: session.user.id ?? "owner", action: "settings.payments_changed", detail: { payOption: d.payOption, advanceKind: d.advanceKind, advanceValue: d.advanceValue } });
  return NextResponse.json(updated);
}

export const PATCH = safeRoute(PATCH_handler);
