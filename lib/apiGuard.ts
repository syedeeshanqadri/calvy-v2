// Shared guard for /api/* requests, run from proxy.ts: CSRF origin check for browser mutations and the broad
// rate-limit buckets (per IP, and per signed-in account for writes). Route-specific limits (login, signup, booking...)
// stay in their own handlers; these are the safety net underneath them.

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Server-to-server callers: no browser cookies are involved, they authenticate with a signature or a secret. */
const NO_CSRF_PREFIXES = [
  "/api/payments/webhook/",
  "/api/payments/cashfree/webhook",
  "/api/subscriptions/webhook",
  "/api/whatsapp/webhook",
  "/api/cron/",
  // NextAuth runs its own CSRF token check (double-submit cookie) on every POST.
  "/api/auth/callback",
  "/api/auth/signin",
  "/api/auth/signout",
  "/api/auth/session",
  "/api/auth/csrf",
];

export function isWebhookPath(pathname: string): boolean {
  return (
    pathname.startsWith("/api/payments/webhook/") ||
    pathname.startsWith("/api/payments/cashfree/webhook") ||
    pathname.startsWith("/api/subscriptions/webhook") ||
    pathname.startsWith("/api/whatsapp/webhook")
  );
}

function hostOf(value: string): string | null {
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * True when a state-changing request must be refused as cross-site. Browsers always send Origin on a cross-origin POST
 * (and Sec-Fetch-Site on every request), so a missing Origin AND missing Sec-Fetch-Site means a non-browser client
 * (curl, a server), which carries no ambient cookies to abuse. Same-origin, and our own tenant subdomains
 * (`{slug}.root`, which post to the main API), are allowed.
 */
export function csrfBlocked(opts: {
  method: string;
  pathname: string;
  origin: string | null;
  secFetchSite: string | null;
  host: string | null;
  rootDomain: string;
}): boolean {
  if (SAFE_METHODS.has(opts.method.toUpperCase())) return false;
  if (NO_CSRF_PREFIXES.some((p) => opts.pathname.startsWith(p))) return false;
  const host = (opts.host ?? "").toLowerCase();
  const root = opts.rootDomain.toLowerCase();
  const allowedHost = (h: string) => {
    const bare = h.replace(/:\d+$/, "");
    return h === host || bare === root || bare === `www.${root}` || bare.endsWith(`.${root}`);
  };

  if (opts.origin && opts.origin !== "null") {
    const oh = hostOf(opts.origin);
    return !(oh && allowedHost(oh));
  }
  if (opts.origin === "null") return true; // sandboxed iframe / privacy redirect: never a legitimate form of ours
  const sfs = opts.secFetchSite;
  if (sfs) return !(sfs === "same-origin" || sfs === "same-site" || sfs === "none");
  return false;
}

export interface Bucket { key: string; limit: number; windowMs: number }

/** Broad per-IP bucket for every API call (webhooks get a roomier one, they are bursty and signed). */
export function ipBucket(pathname: string, ip: string): Bucket {
  if (isWebhookPath(pathname)) return { key: `api-webhook:${ip}`, limit: 600, windowMs: 60_000 };
  return { key: `api-ip:${ip}`, limit: 600, windowMs: 60_000 };
}

/** Per-account bucket for writes by a signed-in user (owner, member or customer). */
export function accountBucket(uid: string): Bucket {
  return { key: `api-acct:${uid}`, limit: 240, windowMs: 60_000 };
}

export function skipsRateLimit(pathname: string): boolean {
  return pathname.startsWith("/api/cron/") || pathname === "/api/health";
}
