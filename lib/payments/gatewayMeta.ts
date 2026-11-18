// What the "Add payment gateway" screen shows for each provider. No server imports: safe in the browser.
// Adding a provider (for example PayU) = one adapter in lib/payments/<name>.ts, one entry here, one case in gateways.ts.

import type { PayRegion } from "./region";
import { PAYPAL_CURRENCIES } from "./paypalCurrencies";

export type GatewayProviderId = "RAZORPAY" | "CASHFREE" | "PHONEPE" | "PAYU" | "CCAVENUE" | "PAYTM" | "STRIPE" | "PAYPAL";
export type GatewayMode = "TEST" | "LIVE";

export interface GatewayField { key: "keyId" | "keySecret" | "webhookSecret" | "extra"; label: string; secret: boolean; optional?: boolean; placeholder?: string }

export interface GatewayMeta {
  id: GatewayProviderId;
  label: string;
  tagline: string;
  /** Who may connect it: India-only gateways are never offered to international businesses, and the reverse. */
  regions: PayRegion[];
  /** Names of the two modes in that provider's own words (PayPal "Sandbox"/"Live"). */
  modeLabels?: { TEST: string; LIVE: string };
  /** Only these currencies work (PayPal does not take AED, SAR, KWD…). Absent = any the provider supports for the region. */
  currencies?: readonly string[];
  fields: GatewayField[];
  /** Where in that provider's dashboard the keys are. */
  guide: { steps: string[]; links: { label: string; href: string }[] };
  /** What the owner must paste into the provider's dashboard so Calvy hears about payments. */
  webhook: { needsSecretFromOwner: boolean; instructions: string; events: string; /** The provider sends no payment events: Calvy re-checks with it when the customer returns. */ none?: boolean };
  /** A caveat shown on the card (for example CCAvenue's IP allow-list). */
  note?: string;
  supportsRefund: boolean;
}

export const GATEWAYS: Record<GatewayProviderId, GatewayMeta> = {
  RAZORPAY: {
    id: "RAZORPAY", label: "Razorpay", tagline: "Cards, UPI, netbanking and wallets.", regions: ["IN"],
    fields: [
      { key: "keyId", label: "Key ID", secret: false, placeholder: "rzp_test_..." },
      { key: "keySecret", label: "Key Secret", secret: true },
      { key: "webhookSecret", label: "Webhook secret", secret: true, placeholder: "The secret you type into the webhook form" },
    ],
    guide: {
      steps: [
        "Log in to the Razorpay Dashboard and pick Test Mode or Live Mode (top of the page).",
        "Open Account & Settings → API Keys → Generate Key. Copy the Key ID and Key Secret (the secret is shown once).",
        "Open Account & Settings → Webhooks → Add New Webhook. Paste the webhook URL from the next step, choose any secret you like, and tick payment_link.paid. Paste the same secret here.",
      ],
      links: [{ label: "Razorpay API keys", href: "https://dashboard.razorpay.com/app/keys" }, { label: "Razorpay webhooks", href: "https://dashboard.razorpay.com/app/webhooks" }],
    },
    webhook: { needsSecretFromOwner: true, instructions: "Razorpay Dashboard → Webhooks → Add New Webhook. Paste this URL and your own secret.", events: "payment_link.paid" },
    supportsRefund: true,
  },
  CASHFREE: {
    id: "CASHFREE", label: "Cashfree", tagline: "UPI, cards and netbanking.", regions: ["IN"],
    fields: [
      { key: "keyId", label: "App ID", secret: false },
      { key: "keySecret", label: "Secret Key", secret: true },
    ],
    guide: {
      steps: [
        "Log in to the Cashfree Merchant Dashboard and switch to Test or Production (top left).",
        "Open Developers → Payment Gateway → API Keys. Copy the App ID and generate the Secret Key.",
        "Open Developers → Webhooks → Add Webhook Endpoint, paste the webhook URL from the next step and tick the Payment webhooks. Cashfree signs them with your Secret Key, so there is nothing more to paste here.",
      ],
      links: [{ label: "Cashfree API keys", href: "https://merchant.cashfree.com/merchants/pg/developers/api-keys" }, { label: "Cashfree webhooks", href: "https://merchant.cashfree.com/merchants/pg/developers/webhooks" }],
    },
    webhook: { needsSecretFromOwner: false, instructions: "Cashfree Dashboard → Developers → Webhooks → Add Webhook Endpoint. Paste this URL.", events: "Payment success, failed and user dropped" },
    supportsRefund: true,
  },
  PHONEPE: {
    id: "PHONEPE", label: "PhonePe PG", tagline: "UPI and cards through PhonePe.", regions: ["IN"],
    fields: [
      { key: "keyId", label: "Client ID", secret: false },
      { key: "keySecret", label: "Client Secret", secret: true },
      { key: "extra", label: "Client Version", secret: false, placeholder: "1", optional: true },
      { key: "webhookSecret", label: "Webhook username:password", secret: true, placeholder: "username:password", optional: false },
    ],
    guide: {
      steps: [
        "Log in to the PhonePe Business Dashboard (use the test dashboard for test mode).",
        "Open Developer Settings → API Keys. Copy the Client ID, Client Secret and Client Version.",
        "Open Developer Settings → Webhook. Paste the webhook URL from the next step, choose a username and password, and paste them here as username:password.",
      ],
      links: [{ label: "PhonePe Business", href: "https://business.phonepe.com/" }, { label: "PhonePe developer docs", href: "https://developer.phonepe.com/payment-gateway" }],
    },
    webhook: { needsSecretFromOwner: true, instructions: "PhonePe Business → Developer Settings → Webhook. Paste this URL with your own username and password.", events: "checkout.order.completed and checkout.order.failed" },
    supportsRefund: true,
  },
  PAYU: {
    id: "PAYU", label: "PayU", tagline: "UPI, cards, netbanking and wallets.", regions: ["IN"],
    fields: [
      { key: "keyId", label: "Merchant Key", secret: false },
      { key: "keySecret", label: "Salt", secret: true, placeholder: "Salt 32-bit (v1)" },
    ],
    guide: {
      steps: [
        "Log in to the PayU Dashboard and switch to Test Mode or Live Mode (top of the page).",
        "Open Payment Gateway → Developer / Merchant Settings → API Keys. Copy the Merchant Key and the Salt (use Salt 32-bit).",
        "Open Developer → Webhooks, add the webhook URL from the next step and turn on the Success and Failure payment events. PayU signs them with your Salt, so there is nothing more to paste here.",
      ],
      links: [{ label: "PayU dashboard", href: "https://onboarding.payu.in/app/account" }, { label: "PayU test dashboard", href: "https://test.payu.in/" }, { label: "PayU developer docs", href: "https://docs.payu.in/" }],
    },
    webhook: { needsSecretFromOwner: false, instructions: "PayU Dashboard → Developer → Webhooks. Paste this URL.", events: "Payment Success and Payment Failure" },
    supportsRefund: true,
  },
  CCAVENUE: {
    id: "CCAVENUE", label: "CCAvenue", tagline: "Cards, UPI, netbanking and wallets.", regions: ["IN"],
    fields: [
      { key: "keyId", label: "Merchant ID", secret: false },
      { key: "keySecret", label: "Working Key", secret: true },
      { key: "extra", label: "Access Code", secret: false },
    ],
    guide: {
      steps: [
        "Log in to the CCAvenue Merchant Dashboard (the test dashboard for test mode).",
        "Your Merchant ID is shown at the top right. Open Settings → API Keys, copy the Access Code and generate the Working Key.",
        "CCAvenue only accepts status checks from IP addresses you approve. Ask CCAvenue support to turn on the Order Status API for your account and to allow the addresses your Calvy host uses.",
      ],
      links: [{ label: "CCAvenue dashboard", href: "https://dashboard.ccavenue.com/" }, { label: "CCAvenue test dashboard", href: "https://login.ccavenue.com/" }],
    },
    webhook: { needsSecretFromOwner: false, instructions: "CCAvenue sends no payment events. Nothing to set up here.", events: "None", none: true },
    note: "CCAvenue has no webhook: a booking is confirmed when the customer returns to the page and Calvy checks with CCAvenue. Their status check needs your account's IP approval.",
    supportsRefund: true,
  },
  PAYTM: {
    id: "PAYTM", label: "Paytm PG", tagline: "UPI, cards, netbanking and Paytm wallet.", regions: ["IN"], modeLabels: { TEST: "Staging", LIVE: "Production" },
    fields: [
      { key: "keyId", label: "MID", secret: false },
      { key: "keySecret", label: "Merchant Key", secret: true, placeholder: "16 characters" },
      { key: "extra", label: "Website name", secret: false, placeholder: "WEBSTAGING (test) or DEFAULT (live)" },
    ],
    guide: {
      steps: [
        "Log in to the Paytm Payment Gateway Dashboard and switch between Test (staging) and Live (production) at the top.",
        "Open Developer → API Keys. Copy the MID (Merchant ID) and the Merchant Key. The Website name is on the same page, usually WEBSTAGING for test and DEFAULT for live.",
        "Open Developer → Webhook, add the webhook URL from the next step as the Payment Status URL. Paytm signs those calls with your Merchant Key, so there is nothing more to paste here.",
      ],
      links: [{ label: "Paytm dashboard", href: "https://dashboard.paytmpayments.com/" }, { label: "Paytm developer docs", href: "https://business.paytm.com/docs" }],
    },
    webhook: { needsSecretFromOwner: false, instructions: "Paytm Dashboard → Developer → Webhook. Paste this URL as the Payment Status URL.", events: "Payment status (success and failure)" },
    supportsRefund: true,
  },
  STRIPE: {
    id: "STRIPE", label: "Stripe", tagline: "Cards and wallets, hosted Stripe Checkout.", regions: ["INTL"],
    fields: [
      { key: "keySecret", label: "Secret or restricted key", secret: true, placeholder: "rk_test_... or sk_test_..." },
      { key: "webhookSecret", label: "Webhook signing secret", secret: true, placeholder: "whsec_..." },
    ],
    guide: {
      steps: [
        "Log in to the Stripe Dashboard and pick Test mode or Live mode (the switch at the top).",
        "Open Developers → API keys → Create restricted key. Give it Checkout Sessions: Write, Refunds: Write and PaymentIntents: Read, and nothing else. Copy the key (it starts with rk_). A full secret key (sk_) also works, but a restricted key is safer.",
        "Open Developers → Webhooks → Add endpoint. Paste the webhook URL from the next step and select the four events listed there. Then open the endpoint and click Reveal under Signing secret (whsec_...) and paste it here.",
      ],
      links: [{ label: "Stripe API keys", href: "https://dashboard.stripe.com/apikeys" }, { label: "Stripe webhooks", href: "https://dashboard.stripe.com/webhooks" }],
    },
    webhook: { needsSecretFromOwner: true, instructions: "Stripe Dashboard → Developers → Webhooks → Add endpoint. Paste this URL.", events: "checkout.session.completed, checkout.session.async_payment_succeeded, checkout.session.async_payment_failed, checkout.session.expired" },
    supportsRefund: true,
  },
  PAYPAL: {
    id: "PAYPAL", label: "PayPal", tagline: "PayPal balance, cards and local methods.", regions: ["INTL"], modeLabels: { TEST: "Sandbox", LIVE: "Live" },
    currencies: PAYPAL_CURRENCIES,
    fields: [
      { key: "keyId", label: "Client ID", secret: false },
      { key: "keySecret", label: "Client secret", secret: true },
      { key: "webhookSecret", label: "Webhook ID", secret: false, placeholder: "Shown after you save the webhook" },
    ],
    guide: {
      steps: [
        "Log in to the PayPal Developer Dashboard and choose Sandbox (test) or Live at the top.",
        "Open Apps & Credentials → Create App (or open your app). Copy the Client ID and the Secret.",
        "Open the app → Webhooks → Add Webhook. Paste the webhook URL from the next step and tick the three events listed there. After saving, copy the Webhook ID shown on that webhook and paste it here.",
      ],
      links: [{ label: "PayPal apps & credentials", href: "https://developer.paypal.com/dashboard/applications" }, { label: "PayPal webhooks", href: "https://developer.paypal.com/api/rest/webhooks/" }],
    },
    webhook: { needsSecretFromOwner: true, instructions: "PayPal Developer Dashboard → your app → Webhooks → Add Webhook. Paste this URL.", events: "CHECKOUT.ORDER.APPROVED, PAYMENT.CAPTURE.COMPLETED, PAYMENT.CAPTURE.DENIED" },
    note: "PayPal does not take AED, SAR, KWD and some other currencies. It can only be connected when your business currency is supported.",
    supportsRefund: true,
  },
};

export const GATEWAY_LIST = Object.values(GATEWAYS);
export const isGatewayProvider = (v: unknown): v is GatewayProviderId => typeof v === "string" && v in GATEWAYS;

/** The gateways a business in this region may connect. India-only ones never reach an international business, and the reverse. */
export const gatewaysForRegion = (region: PayRegion): GatewayMeta[] => GATEWAY_LIST.filter((g) => g.regions.includes(region));

/** Can this provider be connected by a business in this region and currency? Returns the reason when not. */
export function gatewayBlockReason(provider: GatewayProviderId, region: PayRegion, currency: string | null | undefined): string | null {
  const g = GATEWAYS[provider];
  if (!g.regions.includes(region)) return `${g.label} is not available for ${region === "IN" ? "businesses in India" : "international businesses"}.`;
  if (g.currencies && !g.currencies.includes((currency ?? "").toUpperCase())) return `${g.label} does not support ${(currency ?? "").toUpperCase() || "your currency"}. Choose another gateway.`;
  return null;
}
