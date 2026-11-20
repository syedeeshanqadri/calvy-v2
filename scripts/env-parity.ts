// Production env parity check: every env var NAME in Vercel Preview must also exist in Production. Names only: values are
// never read (Vercel returns none for secrets) and never printed. Needs the Vercel CLI, logged in and linked to this project.
//   npm run env:parity
// Exit code 1 when a name is missing in Production, so it can gate a release.
import { execFileSync } from "node:child_process";

/** Names that legitimately exist in only one environment (add with a reason). */
const PREVIEW_ONLY: Record<string, string> = {
  TEST_PASSWORD: "shared password for seeded test accounts: must never exist in Production",
  VERCEL_AUTOMATION_BYPASS_SECRET: "Deployment Protection bypass: previews only, never production",
};

/** Names that must exist in Production whether or not Preview has them. A missing one fails the check. */
const REQUIRED_IN_PRODUCTION: Record<string, string> = {
  TURNSTILE_SITE_KEY: "sign-up bot check (Cloudflare Turnstile); without it sign-up still works but is unprotected beyond the rate limit",
  TURNSTILE_SECRET_KEY: "sign-up bot check (Cloudflare Turnstile), server side",
};

function names(env: "preview" | "production"): Set<string> {
  const out = execFileSync("vercel", ["env", "ls", env, "--format", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const parsed = JSON.parse(out.slice(out.indexOf("{"))) as { envs?: { key: string }[] };
  return new Set((parsed.envs ?? []).map((e) => e.key));
}

const preview = names("preview");
const production = names("production");
const missing = [...preview].filter((n) => !production.has(n) && !(n in PREVIEW_ONLY)).sort();
const productionOnly = [...production].filter((n) => !preview.has(n)).sort();

console.log(`Preview: ${preview.size} names, Production: ${production.size} names`);
if (productionOnly.length) console.log(`Only in Production (fine if intended): ${productionOnly.join(", ")}`);
const requiredMissing = Object.keys(REQUIRED_IN_PRODUCTION).filter((n) => !production.has(n)).sort();
if (requiredMissing.length) {
  console.log(`\nREQUIRED but MISSING in Production (${requiredMissing.length}):\n  ${requiredMissing.map((n) => `${n}: ${REQUIRED_IN_PRODUCTION[n]}`).join("\n  ")}`);
}
if (missing.length || requiredMissing.length) {
  if (!missing.length) process.exit(1);
  console.log(`\nMISSING in Production (${missing.length}):\n  ${missing.join("\n  ")}`);
  process.exit(1);
}
console.log("OK: every Preview env var name exists in Production.");
