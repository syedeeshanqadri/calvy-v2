// Cloudflare Turnstile (invisible bot check) for sign-up. Keys: TURNSTILE_SITE_KEY (shown to the browser) and TURNSTILE_SECRET_KEY (server only).
// Not set in development: the check is skipped. Not set in PRODUCTION: it FAILS OPEN (sign-up must never be locked out by a missing env var), but it
// is loud: one logger.error per server boot and one email to team@calvy.io per day, until the keys are added.
import { logger } from "@/lib/logger";
import { notify } from "@/lib/notifications/enqueue";

const TEAM_EMAIL = "team@calvy.io";
const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

let warnedThisBoot = false;
export function resetTurnstileWarning() { warnedThisBoot = false; }

export const turnstileSiteKey = (): string | null => process.env.TURNSTILE_SITE_KEY || null;

async function warnMissingKeys(now = new Date()) {
  if (!warnedThisBoot) {
    warnedThisBoot = true;
    logger.error("[turnstile] TURNSTILE_SITE_KEY / TURNSTILE_SECRET_KEY are not set in production: sign-up is running WITHOUT the bot check (failing open)");
  }
  try {
    const day = now.toISOString().slice(0, 10);
    await notify({
      event: "platform.alert", audience: "PLATFORM", subjectId: "turnstile-keys-missing", version: day, recipient: TEAM_EMAIL, template: "form_notification",
      payload: { title: "Sign-up bot check is OFF in production", fields: { Problem: "TURNSTILE_SITE_KEY / TURNSTILE_SECRET_KEY are not set, so sign-up is protected only by the rate limit.", Fix: "Add both keys in Vercel (Production) and redeploy." }, at: now.toUTCString() },
    });
  } catch (err) {
    logger.error("[turnstile] daily alert not queued", { err });
  }
}

export type TurnstileResult = { ok: true; skipped?: "no-keys-dev" | "no-keys-prod" } | { ok: false; reason: "missing-token" | "failed" };

/** Pure decision for "are the keys there": the check runs only when both are set. */
export function turnstileConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return !!env.TURNSTILE_SECRET_KEY && !!env.TURNSTILE_SITE_KEY;
}

export async function verifyTurnstile(token: string | null | undefined, ip: string | null, fetcher: typeof fetch = fetch): Promise<TurnstileResult> {
  if (!turnstileConfigured()) {
    if (process.env.NODE_ENV === "production") { await warnMissingKeys(); return { ok: true, skipped: "no-keys-prod" }; }
    return { ok: true, skipped: "no-keys-dev" };
  }
  if (!token) return { ok: false, reason: "missing-token" };
  try {
    const res = await fetcher(VERIFY_URL, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY as string, response: token, ...(ip ? { remoteip: ip } : {}) }),
    });
    const json = (await res.json().catch(() => ({}))) as { success?: boolean };
    return json.success === true ? { ok: true } : { ok: false, reason: "failed" };
  } catch (err) {
    // Cloudflare unreachable: do not lock people out of sign-up; the rate limit still applies.
    logger.error("[turnstile] verify call failed, letting the request through", { err });
    return { ok: true };
  }
}
