// Gateway rows for the settings screen. Nothing secret ever leaves this module: the view has masked ids and flags only.
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/notifications/secret";
import { gatewayWebhookUrl, maskKey } from "@/lib/payments/gateways";
import { GATEWAYS, isGatewayProvider, type GatewayProviderId } from "@/lib/payments/gatewayMeta";

export interface GatewayView {
  id: string;
  provider: GatewayProviderId;
  label: string;
  mode: "TEST" | "LIVE";
  enabled: boolean;
  isDefault: boolean;
  status: "PENDING" | "CONNECTED" | "ERROR";
  statusReason: string | null;
  lastVerifiedAt: string | null;
  keyIdMasked: string;
  hasWebhookSecret: boolean;
  extra: string | null;
  webhookUrl: string;
}

type Row = Awaited<ReturnType<typeof prisma.paymentGateway.findMany>>[number];

export function gatewayView(g: Row): GatewayView {
  let masked = "••••";
  try { masked = maskKey(decryptSecret(g.keyIdEnc)); } catch { /* unreadable: shown as dots, the owner re-enters it */ }
  return {
    id: g.id,
    provider: isGatewayProvider(g.provider) ? g.provider : "RAZORPAY",
    label: GATEWAYS[g.provider as GatewayProviderId]?.label ?? g.provider,
    mode: g.mode === "LIVE" ? "LIVE" : "TEST",
    enabled: g.enabled, isDefault: g.isDefault, status: g.status, statusReason: g.statusReason,
    lastVerifiedAt: g.lastVerifiedAt?.toISOString() ?? null,
    keyIdMasked: masked, hasWebhookSecret: !!g.webhookSecretEnc, extra: g.extra,
    webhookUrl: gatewayWebhookUrl(g.webhookKey),
  };
}

export async function listGateways(businessId: string): Promise<GatewayView[]> {
  const rows = await prisma.paymentGateway.findMany({ where: { businessId }, orderBy: { createdAt: "asc" } });
  return rows.map(gatewayView);
}
