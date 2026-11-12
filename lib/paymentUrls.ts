type Env = Record<string, string | undefined>;

/**
 * The address Cashfree sends the customer back to and calls the webhook on. On a Vercel PREVIEW that is the preview's
 * own address (VERCEL_URL), never the configured production URL, so a sandbox payment made on a preview lands on that
 * preview. Everywhere else it is NEXT_PUBLIC_APP_URL (localhost in development).
 */
export function paymentBaseUrl(env: Env = process.env): string {
  if (env.VERCEL_ENV === "preview" && env.VERCEL_URL) return `https://${env.VERCEL_URL}`.replace(/\/+$/, "");
  return (env.NEXT_PUBLIC_APP_URL ?? `http://localhost:${env.PORT ?? 3000}`).replace(/\/+$/, "");
}

/**
 * Where a provider (Cashfree, Meta) calls webhooks. On a Vercel PREVIEW it is the stable branch alias (VERCEL_BRANCH_URL),
 * so the address registered with the provider survives new pushes; falls back to the per-deployment VERCEL_URL when the
 * alias is missing. Everywhere else it is the same as paymentBaseUrl (production unchanged).
 */
export function webhookBaseUrl(env: Env = process.env): string {
  if (env.VERCEL_ENV === "preview") {
    const host = env.VERCEL_BRANCH_URL?.trim() || env.VERCEL_URL?.trim();
    if (host) return `https://${host}`.replace(/\/+$/, "");
  }
  return paymentBaseUrl(env);
}

export const returnUrlFor = (env: Env = process.env) => `${paymentBaseUrl(env)}/booking/return?order_id={order_id}`;

/**
 * The webhook URL for an order, or undefined when Cashfree cannot reach it (it only calls public https URLs; locally the
 * return page rechecks the order instead). On a Vercel preview with Deployment Protection, Cashfree can only get through
 * with the project's "Protection Bypass for Automation" secret in the query string; Vercel exposes it to the preview as
 * VERCEL_AUTOMATION_BYPASS_SECRET. It is added for previews only, never for production. The webhook signature is still
 * checked on the raw body, so the secret opens the door but proves nothing about the payment.
 */
export function webhookUrlFor(env: Env = process.env): string | undefined {
  const base = webhookBaseUrl(env);
  if (!base.startsWith("https://")) return undefined;
  const url = `${base}/api/payments/cashfree/webhook`;
  const bypass = env.VERCEL_ENV === "preview" ? env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim() : "";
  return bypass ? `${url}?x-vercel-protection-bypass=${encodeURIComponent(bypass)}` : url;
}

/** The webhook URL to register in Cashfree's dashboard, shown without any secret. */
export function webhookUrlForDisplay(env: Env = process.env): string | null {
  const base = webhookBaseUrl(env);
  return base ? `${base}/api/payments/cashfree/webhook` : null;
}
