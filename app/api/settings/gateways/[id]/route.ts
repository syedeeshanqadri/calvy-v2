import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { accessSession } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { parseBody } from "@/lib/validation/common";
import { audit } from "@/lib/audit";
import { gatewayPlanBlock } from "@/lib/payments/access";
import { encryptCredentials, modeMismatch, verifyGateway } from "@/lib/payments/gateways";
import { decryptSecret } from "@/lib/notifications/secret";
import { gatewayView } from "@/lib/payments/gatewayStore";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  mode: z.enum(["TEST", "LIVE"]).optional(),
  keyId: z.string().trim().min(1).max(200).optional(),
  keySecret: z.string().trim().min(1).max(500).optional(),
  webhookSecret: z.string().trim().min(1).max(500).optional(),
  extra: z.string().trim().max(40).optional(),
}).refine((v) => Object.keys(v).length > 0, { message: "Nothing to save." });

/** Enable/disable, make default, switch test/live, or replace credentials. Changing credentials or mode requires a new Verify. */
async function PATCH_handler(req: NextRequest, { params }: Ctx) {
  const session = await accessSession("owner");
  if (!session?.user?.businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const businessId = session.user.businessId;
  const blocked = await gatewayPlanBlock(businessId);
  if (blocked) return blocked;
  const { id } = await params;
  const g = await prisma.paymentGateway.findFirst({ where: { id, businessId } });
  if (!g) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = await parseBody(req, patchSchema);
  if (!parsed.ok) return parsed.res;
  const d = parsed.data;

  const credsChanged = d.keyId !== undefined || d.keySecret !== undefined || d.webhookSecret !== undefined || d.extra !== undefined || (d.mode !== undefined && d.mode !== g.mode);
  const nextMode = d.mode ?? g.mode;
  if (credsChanged) {
    let plainKeyId = d.keyId;
    if (!plainKeyId) { try { plainKeyId = decryptSecret(g.keyIdEnc); } catch { plainKeyId = ""; } }
    const mismatch = modeMismatch(g.provider, nextMode, plainKeyId);
    if (mismatch) return NextResponse.json({ error: mismatch }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (d.mode) data.mode = d.mode;
  if (d.keyId || d.keySecret || d.webhookSecret || d.extra !== undefined) {
    const enc = encryptCredentials({ keyId: d.keyId ?? decryptSecret(g.keyIdEnc), keySecret: d.keySecret ?? decryptSecret(g.keySecretEnc), webhookSecret: d.webhookSecret ?? (g.webhookSecretEnc ? decryptSecret(g.webhookSecretEnc) : null), extra: d.extra ?? g.extra });
    Object.assign(data, enc);
  }
  if (credsChanged) Object.assign(data, { status: "PENDING", statusReason: "Credentials changed: verify again.", enabled: false });
  // Enabling or defaulting needs a verified gateway.
  const wantsOn = d.enabled === true || d.isDefault === true;
  if (wantsOn && (credsChanged || g.status !== "CONNECTED")) return NextResponse.json({ error: "Verify this gateway first. Only a connected gateway can be enabled or made the default." }, { status: 409 });
  if (!credsChanged) {
    if (d.enabled !== undefined) data.enabled = d.enabled;
    if (d.isDefault === true) data.enabled = true;
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (d.isDefault === true && !credsChanged) await tx.paymentGateway.updateMany({ where: { businessId, isDefault: true, NOT: { id } }, data: { isDefault: false } });
    const row = await tx.paymentGateway.update({ where: { id, businessId }, data: { ...data, ...(d.isDefault !== undefined && !credsChanged ? { isDefault: d.isDefault } : {}), ...(credsChanged ? { isDefault: false } : {}) } });
    // A default that gets disabled hands the default to another connected, enabled gateway (or leaves none).
    if (!row.enabled && row.isDefault) {
      await tx.paymentGateway.update({ where: { id, businessId }, data: { isDefault: false } });
      const next = await tx.paymentGateway.findFirst({ where: { businessId, enabled: true, status: "CONNECTED", NOT: { id } }, orderBy: { createdAt: "asc" } });
      if (next) await tx.paymentGateway.update({ where: { id: next.id, businessId }, data: { isDefault: true } });
    }
    return tx.paymentGateway.findUniqueOrThrow({ where: { id, businessId } });
  });
  await audit({ businessId, actorId: session.user.id ?? "owner", action: "gateway.updated", target: id, detail: { fields: Object.keys(d) } });
  return NextResponse.json({ gateway: gatewayView(updated) });
}

/** Remove a gateway. Payments already taken keep their record (gatewayId is cleared). */
async function DELETE_handler(_req: NextRequest, { params }: Ctx) {
  const session = await accessSession("owner");
  if (!session?.user?.businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const businessId = session.user.businessId;
  const { id } = await params;
  const g = await prisma.paymentGateway.findFirst({ where: { id, businessId } });
  if (!g) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.$transaction(async (tx) => {
    await tx.paymentGateway.delete({ where: { id, businessId } });
    if (g.isDefault) {
      const next = await tx.paymentGateway.findFirst({ where: { businessId, enabled: true, status: "CONNECTED" }, orderBy: { createdAt: "asc" } });
      if (next) await tx.paymentGateway.update({ where: { id: next.id, businessId }, data: { isDefault: true } });
    }
  });
  await audit({ businessId, actorId: session.user.id ?? "owner", action: "gateway.removed", target: id, detail: { provider: g.provider } });
  return NextResponse.json({ ok: true });
}

export const PATCH = safeRoute(PATCH_handler);
export const DELETE = safeRoute(DELETE_handler);
