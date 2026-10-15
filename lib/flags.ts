/**
 * Server-side feature flags. Every flag is OFF unless its environment variable
 * is "1" or "true" (case-insensitive). Safe in the Edge runtime (no Node APIs).
 */
export type FeatureFlag =
  | "wallet"
  | "payments"
  | "chatWidget"
  | "broadcasts"
  | "demoBooking"
  | "removeBranding";

export const FEATURE_FLAGS: readonly FeatureFlag[] = [
  "wallet",
  "payments",
  "chatWidget",
  "broadcasts",
  "demoBooking",
  "removeBranding",
];

const ENV_VARS: Record<FeatureFlag, string> = {
  wallet: "FEATURE_WALLET",
  payments: "FEATURE_PAYMENTS",
  chatWidget: "FEATURE_CHAT_WIDGET",
  broadcasts: "FEATURE_BROADCASTS",
  demoBooking: "FEATURE_DEMO_BOOKING",
  removeBranding: "FEATURE_REMOVE_BRANDING",
};

type Env = Record<string, string | undefined>;

export function isFeatureEnabled(flag: FeatureFlag, env?: Env): boolean {
  const source: Env = env ?? process.env;
  const raw = source[ENV_VARS[flag]];
  if (typeof raw !== "string") return false;
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true";
}

export function getFlags(env?: Env): Record<FeatureFlag, boolean> {
  const out = {} as Record<FeatureFlag, boolean>;
  for (const f of FEATURE_FLAGS) out[f] = isFeatureEnabled(f, env);
  return out;
}

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + "/");
}

const WALLET_PREFIXES = ["/api/wallet", "/api/admin/withdrawals"];
const PAYMENT_PREFIXES = [
  "/api/razorpay/connect",
  "/api/billing/portal",
  "/api/billing/sync",
  "/api/billing/upgrade",
  "/api/billing/status",
  "/api/settings/payout",
  "/api/bookings/confirm",
];
const BROADCAST_PREFIXES = ["/api/broadcasts"];

/**
 * Which flag guards an /api path, or null. Webhooks are deliberately never
 * guarded so payment events are not lost.
 */
export function featureForApiPath(pathname: string): FeatureFlag | null {
  if (WALLET_PREFIXES.some((p) => matchesPrefix(pathname, p))) return "wallet";
  if (PAYMENT_PREFIXES.some((p) => matchesPrefix(pathname, p))) return "payments";
  if (/^\/api\/appointments\/[^/]+\/payment(\/.*)?$/.test(pathname)) return "payments";
  if (BROADCAST_PREFIXES.some((p) => matchesPrefix(pathname, p))) return "broadcasts";
  return null;
}
