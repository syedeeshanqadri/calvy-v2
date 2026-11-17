// What the "Add payment gateway" screen shows for each provider. No server imports: safe in the browser.
// Adding a provider (for example PayU) = one adapter in lib/payments/<name>.ts, one entry here, one case in gateways.ts.

export type GatewayProviderId = "RAZORPAY" | "CASHFREE" | "PHONEPE";
export type GatewayMode = "TEST" | "LIVE";

export interface GatewayField { key: "keyId" | "keySecret" | "webhookSecret" | "extra"; label: string; secret: boolean; optional?: boolean; placeholder?: string }

export interface GatewayMeta {
  id: GatewayProviderId;
  label: string;
  tagline: string;
  fields: GatewayField[];
  /** Where in that provider's dashboard the keys are. */
  guide: { steps: string[]; links: { label: string; href: string }[] };
  /** What the owner must paste into the provider's dashboard so Calvy hears about payments. */
  webhook: { needsSecretFromOwner: boolean; instructions: string; events: string };
  supportsRefund: boolean;
}

export const GATEWAYS: Record<GatewayProviderId, GatewayMeta> = {
  RAZORPAY: {
    id: "RAZORPAY", label: "Razorpay", tagline: "Cards, UPI, netbanking and wallets.",
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
    id: "CASHFREE", label: "Cashfree", tagline: "UPI, cards and netbanking.",
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
    id: "PHONEPE", label: "PhonePe PG", tagline: "UPI and cards through PhonePe.",
    fields: [
      { key: "keyId", label: "Client ID", secret: false },
      { key: "keySecret", label: "Client Secret", secret: true },
      { key: "extra", label: "Client Version", secret: false, placeholder: "1" },
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
};

export const GATEWAY_LIST = Object.values(GATEWAYS);
export const isGatewayProvider = (v: unknown): v is GatewayProviderId => typeof v === "string" && v in GATEWAYS;
