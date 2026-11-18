// Scans the BUILT client bundle (.next/static) for secret-looking strings and for server-only env var names.
// Run after `npm run build`:   npm run audit:secrets      Exit 1 on any hit. Prints file + pattern name, never the matched value.
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const PATTERNS: [string, RegExp][] = [
  ["Stripe secret key", /sk_(live|test)_[A-Za-z0-9]{16,}/],
  ["Stripe webhook secret", /whsec_[A-Za-z0-9]{16,}/],
  ["Razorpay secret/key", /rzp_(live|test)_[A-Za-z0-9]{10,}/],
  ["Resend key", /\bre_[A-Za-z0-9]{24,}\b/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["Private key block", /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["Database URL with credentials", /postgres(ql)?:\/\/[^\s"'`:@]+:[^\s"'`@]+@/],
  ["Cashfree secret", /cfsk_(ma_)?(prod|test)_[A-Za-z0-9]{10,}/],
  ["Vercel blob token", /vercel_blob_rw_[A-Za-z0-9_]{10,}/],
  ["JWT-like long token", /\beyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}\b/],
];
// Names that must never appear in client code (only NEXT_PUBLIC_* may).
const SERVER_ONLY_NAMES = [
  "NEXTAUTH_SECRET", "DATABASE_URL", "DIRECT_URL", "CASHFREE_SECRET_KEY", "RESEND_API_KEY", "CRON_SECRET", "TRACKING_SECRET",
  "VAPID_PRIVATE_KEY", "BLOB_READ_WRITE_TOKEN", "S3_SECRET_ACCESS_KEY", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_TOKEN",
  "GATEWAY_ENCRYPTION_KEY", "GOOGLE_CLIENT_SECRET", "FACEBOOK_CLIENT_SECRET", "ADMIN_SETUP_SECRET",
];

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|css|html|map)$/.test(n) && !n.endsWith(".map")) out.push(p);
  }
  return out;
}

const root = join(process.cwd(), ".next", "static");
if (!existsSync(root)) { console.error("No .next/static: run `npm run build` first."); process.exit(2); }
const files = walk(root);
let hits = 0;
for (const f of files) {
  const src = readFileSync(f, "utf8");
  for (const [name, re] of PATTERNS) if (re.test(src)) { hits++; console.log(`HIT  ${name}  in ${f.replace(process.cwd() + "/", "")}`); }
  for (const n of SERVER_ONLY_NAMES) if (src.includes(n)) { hits++; console.log(`HIT  server-only env name ${n}  in ${f.replace(process.cwd() + "/", "")}`); }
}
console.log(`Scanned ${files.length} client files, ${hits} hit(s).`);
process.exit(hits ? 1 : 0);
