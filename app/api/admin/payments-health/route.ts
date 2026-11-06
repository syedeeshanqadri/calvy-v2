import { safeRoute } from "@/lib/api";
import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/adminAuth";
import { prisma } from "@/lib/prisma";
import { isFeatureEnabled } from "@/lib/flags";
import { getPaymentProvider } from "@/lib/payments";
import { FULL_ONLINE_ENABLED } from "@/lib/fees";
import { PENDING_PAYMENT } from "@/lib/holds";
import { evaluatePaymentsHealth } from "@/lib/paymentsHealth";
import { paymentBaseUrl, webhookUrlForDisplay } from "@/lib/paymentUrls";

export const dynamic = "force-dynamic";

const set = (v: string | undefined) => !!v?.trim();

/**
 * Go-live check for online payments, for the super admin only. Reports whether each piece is in place.
 * Names and yes/no only: never a key, a secret or a customer detail.
 */
async function GET_handler() {
  if (!(await isAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const provider = getPaymentProvider();
  const now = new Date();
  const [lastWebhook, lastPaid, openHolds, lapsedHolds] = await Promise.all([
    prisma.webhookEvent.findFirst({ where: { provider: "CASHFREE" }, orderBy: { receivedAt: "desc" }, select: { receivedAt: true, kind: true } }),
    prisma.payment.findFirst({ where: { status: "PAID" }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
    prisma.appointment.count({ where: { status: PENDING_PAYMENT, holdExpiresAt: { gt: now } } }),
    prisma.appointment.count({ where: { status: PENDING_PAYMENT, holdExpiresAt: { lte: now } } }),
  ]);

  const deployment = process.env.VERCEL_ENV === "production" ? "production" : process.env.VERCEL_ENV === "preview" ? "preview" : "development";
  const cashfreeEnv = process.env.CASHFREE_ENV === "production" ? "production" : "sandbox";
  const verdict = evaluatePaymentsHealth({
    flagOn: isFeatureEnabled("onlinePayments"), provider: provider ? provider.name : null, cashfreeEnv,
    appUrl: paymentBaseUrl(), cronSecretSet: set(process.env.CRON_SECRET), receiptCompanyDetailsSet: set(process.env.CALVY_LEGAL_NAME) && set(process.env.CALVY_ADDRESS), deployment,
  });
  const checks = {
    deployment,
    flagOnlinePaymentsOn: isFeatureEnabled("onlinePayments"),
    provider: provider ? provider.name : null,
    cashfreeAppIdSet: set(process.env.CASHFREE_APP_ID),
    cashfreeSecretSet: set(process.env.CASHFREE_SECRET_KEY),
    cashfreeEnv,
    webhookUrlToRegister: webhookUrlForDisplay(),
    vercelBypassSecretSet: set(process.env.VERCEL_AUTOMATION_BYPASS_SECRET),
    cronSecretSet: set(process.env.CRON_SECRET),
    receiptCompanyDetailsSet: set(process.env.CALVY_LEGAL_NAME) && set(process.env.CALVY_ADDRESS),
    receiptGstinSet: set(process.env.CALVY_GSTIN),
    fullOnlineEnabled: FULL_ONLINE_ENABLED,
  };
  return NextResponse.json({
    ready: verdict.ready, mode: verdict.mode, problems: verdict.problems, warnings: verdict.warnings, checks,
    activity: { lastWebhookAt: lastWebhook?.receivedAt ?? null, lastWebhookKind: lastWebhook?.kind ?? null, lastPaidAt: lastPaid?.updatedAt ?? null, openHolds, lapsedHoldsToSweep: lapsedHolds },
  });
}

export const GET = safeRoute(GET_handler);
