import { webhookBaseUrl } from "@/lib/paymentUrls";
import type { UrlBases } from "@/lib/whatsapp/templates";

type Env = Record<string, string | undefined>;

/**
 * The callback URL the owner pastes into their Meta app. On a Vercel preview it carries the project's automation
 * bypass secret (same pattern as the Cashfree webhook, lib/paymentUrls.ts) so Meta can get through Deployment
 * Protection; never in production. The signature is still checked, so the bypass proves nothing by itself.
 */
export function whatsappCallbackUrl(key: string, env: Env = process.env): string {
  const url = `${webhookBaseUrl(env)}/api/whatsapp/webhook/${key}`;
  const bypass = env.VERCEL_ENV === "preview" ? env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim() : "";
  return bypass ? `${url}?x-vercel-protection-bypass=${encodeURIComponent(bypass)}` : url;
}

/** Fixed parts of the template URL buttons; Meta appends the {{1}} suffix. Must be public https in production. */
export function templateUrlBases(slug: string, env: Env = process.env): UrlBases {
  const base = (env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  return { tracking: `${base}/${slug}/q/`, dashboard: `${base}/dashboard/` };
}
