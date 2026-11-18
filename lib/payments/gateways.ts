// The business's own gateways: build the right adapter from a stored row, verify credentials, and the webhook URL.
// Credentials are AES-GCM encrypted at rest (lib/notifications/secret) and are never returned or logged.
import { randomBytes } from "node:crypto";
import { decryptSecret, encryptSecret } from "@/lib/notifications/secret";
import { webhookBaseUrl } from "@/lib/paymentUrls";
import { createCashfreeProvider } from "./cashfree";
import { createRazorpayProvider } from "./razorpay";
import { createPhonePeProvider } from "./phonepe";
import { createPayUProvider } from "./payu";
import { createCCAvenueProvider } from "./ccavenue";
import { createPaytmProvider } from "./paytm";
import { createStripeProvider } from "./stripe";
import { createPayPalProvider } from "./paypal";
import type { PaymentProvider } from "./provider";
import type { GatewayMode, GatewayProviderId } from "./gatewayMeta";

export interface GatewayRow {
  provider: GatewayProviderId | string;
  mode: string;
  keyIdEnc: string;
  keySecretEnc: string;
  webhookSecretEnc: string | null;
  extra: string | null;
}

export interface GatewayCredentials { keyId: string; keySecret: string; webhookSecret?: string | null; extra?: string | null }

export const newWebhookKey = () => randomBytes(24).toString("base64url");

export const encryptCredentials = (c: GatewayCredentials) => ({
  keyIdEnc: encryptSecret(c.keyId),
  keySecretEnc: encryptSecret(c.keySecret),
  webhookSecretEnc: c.webhookSecret ? encryptSecret(c.webhookSecret) : null,
  extra: c.extra?.trim() || null,
});

/** The adapter for a stored gateway. Throws when the stored credentials cannot be decrypted. */
export function providerForGateway(row: GatewayRow, fetchImpl: typeof fetch = fetch): PaymentProvider {
  const keyId = decryptSecret(row.keyIdEnc);
  const keySecret = decryptSecret(row.keySecretEnc);
  const webhookSecret = row.webhookSecretEnc ? decryptSecret(row.webhookSecretEnc) : null;
  const mode: GatewayMode = row.mode === "LIVE" ? "LIVE" : "TEST";
  switch (row.provider) {
    case "RAZORPAY": return createRazorpayProvider({ keyId, keySecret, webhookSecret }, fetchImpl);
    case "CASHFREE": return createCashfreeProvider({ appId: keyId, secretKey: keySecret, env: mode === "LIVE" ? "production" : "sandbox" }, fetchImpl);
    case "PHONEPE": return createPhonePeProvider({ clientId: keyId, clientSecret: keySecret, clientVersion: row.extra || "1", mode, webhookCredentials: webhookSecret }, fetchImpl);
    case "PAYU": return createPayUProvider({ merchantKey: keyId, salt: keySecret, mode }, fetchImpl);
    case "CCAVENUE": return createCCAvenueProvider({ merchantId: keyId, workingKey: keySecret, accessCode: row.extra ?? "", mode }, fetchImpl);
    case "PAYTM": return createPaytmProvider({ mid: keyId, merchantKey: keySecret, website: row.extra || (mode === "LIVE" ? "DEFAULT" : "WEBSTAGING"), mode }, fetchImpl);
    case "STRIPE": return createStripeProvider({ secretKey: keySecret, webhookSecret }, fetchImpl);
    case "PAYPAL": return createPayPalProvider({ clientId: keyId, clientSecret: keySecret, mode, webhookId: webhookSecret }, fetchImpl);
    default: throw new Error("Unknown payment gateway");
  }
}

/** Razorpay and Stripe keys name their own mode: a live key saved as test (or the reverse) is caught before any call. */
export function modeMismatch(provider: string, mode: string, keyId: string): string | null {
  const live = (mode === "LIVE");
  if (provider === "RAZORPAY") {
    if (!live && keyId.startsWith("rzp_live_")) return "That is a live key but the mode is Test. Switch the mode to Live or use a test key.";
    if (live && keyId.startsWith("rzp_test_")) return "That is a test key but the mode is Live. Switch the mode to Test or use a live key.";
  }
  if (provider === "STRIPE") {
    if (keyId.startsWith("pk_")) return "That is the publishable key (pk_…). Paste the secret or restricted key (sk_… or rk_…).";
    if (!/^(sk|rk)_(test|live)_/.test(keyId)) return "A Stripe secret or restricted key starts with sk_ or rk_.";
    if (!live && keyId.includes("_live_")) return "That is a live key but the mode is Test. Switch the mode to Live or use a test key.";
    if (live && keyId.includes("_test_")) return "That is a test key but the mode is Live. Switch the mode to Test or use a live key.";
  }
  return null;
}

export type VerifyResult = { ok: true } | { ok: false; reason: string };

/** A real, lightweight call to the provider. Never throws: a failure is the reason shown to the owner. */
export async function verifyGateway(row: GatewayRow, fetchImpl: typeof fetch = fetch): Promise<VerifyResult> {
  try {
    const provider = providerForGateway(row, fetchImpl);
    if (!provider.verify) return { ok: false, reason: "This provider cannot be verified." };
    return await provider.verify();
  } catch {
    return { ok: false, reason: "The saved credentials could not be read. Enter them again." };
  }
}

/** Where the provider's dashboard must send payment events for this gateway. */
export const gatewayWebhookUrl = (webhookKey: string, env: Record<string, string | undefined> = process.env) =>
  `${webhookBaseUrl(env)}/api/payments/webhook/${webhookKey}`;

/** Masks a stored id for display (never the secret): "rzp_test_Ab…xYz9". */
export function maskKey(plain: string): string {
  return plain.length <= 8 ? "••••" : `${plain.slice(0, 8)}…${plain.slice(-3)}`;
}
