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
import { GATEWAYS, gatewayBlockReason, type GatewayProviderId } from "@/lib/payments/gatewayMeta";
import { regionOf } from "@/lib/payments/region";
import { gatewayView, listGateways } from "@/lib/payments/gatewayStore";

export const dynamic = "force-dynamic";

const GATEWAY_IDS = Object.keys(GATEWAYS) as [GatewayProviderId, ...GatewayProviderId[]];
const secret = z.string().trim().min(1).max(500);
const createSchema = z.object({
  provider: z.enum(GATEWAY_IDS),
  mode: z.enum(["TEST", "LIVE"]).default("TEST"),
  /** Absent for a provider with no key-id field (Stripe): derived from the secret below. */
  keyId: z.string().trim().max(200).optional(),
  keySecret: secret,
  webhookSecret: z.string().trim().max(500).optional(),
  extra: z.string().trim().max(60).optional(),
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
  // The region comes from the business, never from the browser: an India-only gateway is refused for an international business and the reverse.
  const biz = await prisma.business.findUnique({ where: { id: businessId }, select: { currency: true } });
  const blockedProvider = gatewayBlockReason(d.provider, regionOf({ currency: biz?.currency }), biz?.currency);
  if (blockedProvider) return NextResponse.json({ error: blockedProvider, code: "GATEWAY_REGION" }, { status: 403 });

  const given: Record<string, string | undefined> = { keyId: d.keyId, keySecret: d.keySecret, webhookSecret: d.webhookSecret, extra: d.extra };
  const missing = meta.fields.find((f) => !f.optional && !given[f.key]);
  if (missing) return NextResponse.json({ error: `${missing.label} is required.` }, { status: 400 });
  // A provider with no key-id field (Stripe) is identified by the start of its secret key, shown masked in the list.
  const keyId = meta.fields.some((f) => f.key === "keyId") ? d.keyId! : d.keySecret.slice(0, 12);
  const mismatch = modeMismatch(d.provider, d.mode, meta.fields.some((f) => f.key === "keyId") && d.provider !== "STRIPE" ? keyId : d.keySecret);
  if (mismatch) return NextResponse.json({ error: mismatch }, { status: 400 });
  if (d.provider === "STRIPE" && d.webhookSecret && !d.webhookSecret.startsWith("whsec_")) return NextResponse.json({ error: "The Stripe signing secret starts with whsec_. Copy it from the webhook endpoint page." }, { status: 400 });

  const creds = encryptCredentials({ keyId, keySecret: d.keySecret, webhookSecret: d.webhookSecret, extra: d.extra });
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
