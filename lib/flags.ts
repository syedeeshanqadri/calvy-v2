/**
 * Server-side feature flags. Every flag is OFF unless its environment variable
 * is "1" or "true" (case-insensitive). Safe in the Edge runtime (no Node APIs).
 */
export type FeatureFlag =
  | "payments"
  | "chatWidget"
  | "broadcasts"
  | "demoBooking"
  | "removeBranding"
  | "onlinePayments"
  | "intlSubscriptions";

export const FEATURE_FLAGS: readonly FeatureFlag[] = [
  "payments",
  "chatWidget",
  "broadcasts",
  "demoBooking",
  "removeBranding",
  "onlinePayments",
  "intlSubscriptions",
];

const ENV_VARS: Record<FeatureFlag, string> = {
  payments: "FEATURE_PAYMENTS",
  chatWidget: "FEATURE_CHAT_WIDGET",
  broadcasts: "FEATURE_BROADCASTS",
  demoBooking: "FEATURE_DEMO_BOOKING",
  removeBranding: "FEATURE_REMOVE_BRANDING",
  // Cashfree online booking payments (Rs 10 fee / full online). Off in production until the settings screen ships.
  onlinePayments: "FEATURE_ONLINE_PAYMENTS",
  // International Calvy plan subscriptions (Cashfree). Parked: while OFF (and until built) the Billing page shows "Coming soon" outside India.
  intlSubscriptions: "CF_INTL_SUBSCRIPTIONS",
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

/**
 * PLAN_ENFORCEMENT: are plan limits and feature gates applied? OFF unless the variable is "1" or
 * "true" (same parsing as the feature flags, off in every environment by default). While off,
 * every business is treated as having every feature and no limits. This is not one of the
 * FEATURE_FLAGS: it guards no API path and no UI entry point, it switches the limits themselves.
 */
export function isPlanEnforcementOn(env?: Env): boolean {
  const raw = (env ?? process.env).PLAN_ENFORCEMENT;
  if (typeof raw !== "string") return false;
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true";
}

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + "/");
}

const PAYMENT_PREFIXES: string[] = [];
const BROADCAST_PREFIXES = ["/api/broadcasts"];

/**
 * Which flag guards an /api path, or null. Webhooks are deliberately never
 * guarded so payment events are not lost.
 */
/** Canonical form so encoded, repeated-slash or dot-segment paths cannot dodge the prefix match. */
export function normalizeApiPath(pathname: string): string {
  let p = pathname;
  for (let i = 0; i < 3; i++) {
    try {
      const d = decodeURIComponent(p);
      if (d === p) break;
      p = d;
    } catch {
      break;
    }
  }
  const out: string[] = [];
  for (const seg of p.replace(/\\/g, "/").split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") out.pop();
    else out.push(seg.toLowerCase());
  }
  return "/" + out.join("/");
}

export function featureForApiPath(rawPathname: string): FeatureFlag | null {
  const pathname = normalizeApiPath(rawPathname);
  if (PAYMENT_PREFIXES.some((p) => matchesPrefix(pathname, p))) return "payments";
  if (/^\/api\/appointments\/[^/]+\/payment(\/.*)?$/.test(pathname)) return "payments";
  if (BROADCAST_PREFIXES.some((p) => matchesPrefix(pathname, p))) return "broadcasts";
  return null;
}
