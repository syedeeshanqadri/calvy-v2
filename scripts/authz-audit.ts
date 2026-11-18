// Lists every API route handler and the guard it uses. A route with no recognised guard and no entry in PUBLIC_BY_DESIGN
// fails the run (exit 1), so a new unguarded route cannot slip in unnoticed.   npm run audit:authz
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const GUARDS: [string, RegExp][] = [
  ["owner/member session", /accessSession\(|getServerSession\(|requireTenant|requireOwner/],
  ["admin (DB flag + 2FA)", /requireAdminApi\(|twoFaUser\(|endAdminSession\(/],
  ["customer session", /customerSession\(|getCustomer\(/],
  ["onboarding wizard owner", /wizardOwner\(/],
  ["queue staff context", /queueContext\(/],
  ["cron secret", /CRON_SECRET|isCronAuthorized\(/],
  ["webhook signature", /verifyWebhook|parseCashfreeWebhook|parseSubsWebhook|verifySignature|x-hub-signature/i],
];

/** Public on purpose. Each needs a reason; the handler must still validate input and rate limit (the proxy adds per-IP buckets). */
const PUBLIC_BY_DESIGN: Record<string, string> = {
  "auth/[...nextauth]": "NextAuth endpoint (its own CSRF token, credentials checked inside authorize)",
  "auth/forgot-password": "public; rate limited; same answer for known and unknown emails",
  "auth/reset-password": "public; one-time hashed token",
  "auth/resend-verification": "public; rate limited; same answer for every email",
  "auth/verify-email": "public; one-time hashed token, per-IP limited",
  signup: "public sign-up; per-IP limited",
  availability: "public booking page data (no personal data)",
  bookings: "public booking creation; validated, rate limited, business resolved from slug",
  "token-availability": "public token-queue availability",
  track: "public tracking by unguessable appointment id",
  unsubscribe: "public; signed token",
  leads: "public marketing lead form; rate limited",
  calendar: "private calendar feed: the secret token in the URL is the credential (Google/Outlook/Apple cannot log in); per-IP and per-token limited",
  health: "uptime monitor; names only, no secrets",
  region: "public: country from edge headers",
  geo: "public: currency/country lookup",
  flags: "public: boolean feature flags only",
  features: "public plan-feature names",
  "payments/status": "public; keyed by unguessable order id, no personal data",
  "payments/return": "public gateway return redirect; reconciles with the gateway",
  "payments/mock": "dev/sandbox mock checkout (disabled in production)",
  "data-deletion": "public request form; rate limited",
  support: "public support form + owner reads",
  "customer/book-again": "customer link, validated",
  "customer/follow-up": "signed follow-up ticket",
  "rewards": "public reward lookup by signed ticket",
  website: "public site JSON (published data only)",
  "customer/signup": "public customer sign-up; rate limited",
  "customer/forgot-password": "public; rate limited; same answer for every email",
  "customer/reset-password": "public; one-time hashed token",
  "customer/verify-email": "public; one-time token",
  "customer/resend-verification": "public; rate limited; same answer",
  "team/accept": "public; one-time invite token (hashed), rate limited",
  brand: "owner session via accessSession wrapper",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name === "route.ts") out.push(p);
  }
  return out;
}

const root = join(process.cwd(), "app", "api");
const rows = walk(root).sort().map((file) => {
  const src = readFileSync(file, "utf8");
  const rel = relative(root, file).split(sep).slice(0, -1).join("/");
  const guards = GUARDS.filter(([, re]) => re.test(src)).map(([n]) => n);
  const hasLimit = /rateLimit\(|checkLimit\(/.test(src);
  const reason = Object.entries(PUBLIC_BY_DESIGN).find(([k]) => rel === k || rel.startsWith(k + "/"))?.[1];
  return { rel, guards, hasLimit, reason };
});

let bad = 0;
for (const r of rows) {
  const status = r.guards.length ? r.guards.join(" + ") : r.reason ? `PUBLIC (${r.reason})` : "UNGUARDED";
  if (!r.guards.length && !r.reason) bad++;
  console.log(`${r.guards.length || r.reason ? "ok  " : "FAIL"} /api/${r.rel.padEnd(44)} ${status}${r.hasLimit ? "  [limited]" : ""}`);
}
console.log(`\n${rows.length} routes, ${bad} without a recognised guard.`);
process.exit(bad ? 1 : 0);
