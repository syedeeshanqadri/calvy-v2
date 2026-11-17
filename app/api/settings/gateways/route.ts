import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { accessSession } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { parseBody } from "@/lib/validation/common";
import { audit } from "@/lib/audit";
import { gatewayPlanBlock } from "@/lib/payments/access";
import { encryptCredentials, modeMismatch, newWebhookKey, verifyGateway } from "@/lib/payments/gateways";
import { GATEWAYS } from "@/lib/payments/gatewayMeta";
import { gatewayView, listGateways } from "@/lib/payments/gatewayStore";

export const dynamic = "force-dynamic";

const secret = z.string().trim().min(1).max(500);
const createSchema = z.object({
  provider: z.enum(["RAZORPAY", "CASHFREE", "PHONEPE"]),
  mode: z.enum(["TEST", "LIVE"]).default("TEST"),
  keyId: z.string().trim().min(1).max(200),
  keySecret: secret,
  webhookSecret: z.string().trim().max(500).optional(),
  extra: z.string().trim().max(40).optional(),
});

/** Owner-only list of the business's gateways (masked, no secrets). */
async function GET_handler() {
  const session = await accessSession("owner");
  if (!session?.user?.businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const blocked = await gatewayPlanBlock(session.user.businessId);
  if (blocked) return blocked;
  return NextResponse.json({ gateways: await listGateways(session.user.businessId) });
}

/** Add a gateway: store the encrypted credentials, then verify them with a real, lightweight call. Owner only, Mid/Top plans. */
async function POST_handler(req: NextRequest) {
  const session = await accessSession("owner");
  if (!session?.user?.businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const businessId = session.user.businessId;
  const blocked = await gatewayPlanBlock(businessId);
  if (blocked) return blocked;
  const parsed = await parseBody(req, createSchema);
  if (!parsed.ok) return parsed.res;
  const d = parsed.data;

  const meta = GATEWAYS[d.provider];
  const missing = meta.fields.find((f) => !f.optional && f.key === "webhookSecret" && meta.webhook.needsSecretFromOwner && !d.webhookSecret);
  if (missing) return NextResponse.json({ error: `${missing.label} is required.` }, { status: 400 });
  const mismatch = modeMismatch(d.provider, d.mode, d.keyId);
  if (mismatch) return NextResponse.json({ error: mismatch }, { status: 400 });

  const creds = encryptCredentials({ keyId: d.keyId, keySecret: d.keySecret, webhookSecret: d.webhookSecret, extra: d.extra });
  let row;
  try {
    row = await prisma.paymentGateway.create({
      data: { businessId, provider: d.provider, mode: d.mode, ...creds, webhookKey: newWebhookKey() },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: `You already added ${meta.label} in ${d.mode === "LIVE" ? "Live" : "Test"} mode. Edit or remove it first.` }, { status: 409 });
    }
    throw e;
  }
  const result = await verifyGateway(row);
  const hasDefault = (await prisma.paymentGateway.count({ where: { businessId, isDefault: true } })) > 0;
  row = await prisma.paymentGateway.update({
    where: { id: row.id },
    data: result.ok
      ? { status: "CONNECTED", statusReason: null, lastVerifiedAt: new Date(), enabled: true, isDefault: !hasDefault }
      : { status: "ERROR", statusReason: result.reason, enabled: false },
  });
  await audit({ businessId, actorId: session.user.id ?? "owner", action: "gateway.added", target: row.id, detail: { provider: d.provider, mode: d.mode, verified: result.ok } });
  return NextResponse.json({ gateway: gatewayView(row) }, { status: 201 });
}

export const GET = safeRoute(GET_handler);
export const POST = safeRoute(POST_handler);
