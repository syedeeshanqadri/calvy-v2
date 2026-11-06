import { safeRoute } from "@/lib/api";
import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/adminAuth";
import { prisma } from "@/lib/prisma";
import { isFeatureEnabled } from "@/lib/flags";
import { getPaymentProvider } from "@/lib/payments";
import { FULL_ONLINE_ENABLED } from "@/lib/fees";
import { PENDING_PAYMENT } from "@/lib/holds";

export const dynamic = "force-dynamic";

const set = (v: string | undefined) => !!v?.trim();

/**
 * Go-live check for online payments, for the super admin only. Reports whether each piece is in place.
 * Names and yes/no only: never a key, a secret or a customer detail.
 */
async function GET_handler() {
  if (!(await isAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "").replace(/\/+$/, "");
  const provider = getPaymentProvider();
  const now = new Date();
  const [lastWebhook, lastPaid, openHolds, lapsedHolds] = await Promise.all([
    prisma.webhookEvent.findFirst({ where: { provider: "CASHFREE" }, orderBy: { receivedAt: "desc" }, select: { receivedAt: true, kind: true } }),
    prisma.payment.findFirst({ where: { status: "PAID" }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
    prisma.appointment.count({ where: { status: PENDING_PAYMENT, holdExpiresAt: { gt: now } } }),
    prisma.appointment.count({ where: { status: PENDING_PAYMENT, holdExpiresAt: { lte: now } } }),
  ]);

  const checks = {
    flagOnlinePaymentsOn: isFeatureEnabled("onlinePayments"),
    provider: provider ? provider.name : null, // CASHFREE, MOCK (no keys, dev only) or null (production without keys)
    cashfreeAppIdSet: set(process.env.CASHFREE_APP_ID),
    cashfreeSecretSet: set(process.env.CASHFREE_SECRET_KEY),
    cashfreeEnv: process.env.CASHFREE_ENV === "production" ? "production" : "sandbox",
    appUrlIsHttps: appUrl.startsWith("https://"),
    webhookUrl: appUrl ? `${appUrl}/api/payments/cashfree/webhook` : null,
    cronSecretSet: set(process.env.CRON_SECRET),
    receiptCompanyDetailsSet: set(process.env.CALVY_LEGAL_NAME) && set(process.env.CALVY_ADDRESS),
    receiptGstinSet: set(process.env.CALVY_GSTIN),
    fullOnlineEnabled: FULL_ONLINE_ENABLED,
  };
  const problems: string[] = [];
  if (!checks.flagOnlinePaymentsOn) problems.push("FEATURE_ONLINE_PAYMENTS is not on.");
  if (checks.provider !== "CASHFREE") problems.push("Cashfree is not configured (set CASHFREE_APP_ID and CASHFREE_SECRET_KEY).");
  if (checks.cashfreeEnv === "sandbox" && process.env.NODE_ENV === "production") problems.push("CASHFREE_ENV is sandbox in production: real customers cannot pay.");
  if (!checks.appUrlIsHttps) problems.push("NEXT_PUBLIC_APP_URL is not an https URL: Cashfree webhooks cannot reach it.");
  if (!checks.cronSecretSet) problems.push("CRON_SECRET is not set: lapsed holds are not swept.");
  if (!checks.receiptCompanyDetailsSet) problems.push("CALVY_LEGAL_NAME / CALVY_ADDRESS are not set: receipts have no company details.");
  return NextResponse.json({
    ready: problems.length === 0, problems, checks,
    activity: { lastWebhookAt: lastWebhook?.receivedAt ?? null, lastWebhookKind: lastWebhook?.kind ?? null, lastPaidAt: lastPaid?.updatedAt ?? null, openHolds, lapsedHoldsToSweep: lapsedHolds },
  });
}

export const GET = safeRoute(GET_handler);
