// Go-live check for online payments (pure). Booleans and names only: never a key, secret or customer detail.
export interface HealthInput {
  flagOn: boolean;
  /** CASHFREE, MOCK (no keys, development only) or null (production without keys). */
  provider: string | null;
  cashfreeEnv: "sandbox" | "production";
  appUrl: string;
  cronSecretSet: boolean;
  receiptCompanyDetailsSet: boolean;
  /** "production" for the live deployment; anything else (preview, development) is a test deployment. */
  deployment: "production" | "preview" | "development";
}

export interface HealthResult { ready: boolean; mode: "sandbox" | "production"; problems: string[]; warnings: string[] }

/**
 * `problems` block going live; `warnings` do not. Sandbox is the expected setup on a preview or on localhost, so it is not a
 * problem there; on production it is (real customers could not pay). Cashfree can only call https, but locally the return
 * page rechecks the order, so a non-https address is a warning outside production.
 */
export function evaluatePaymentsHealth(i: HealthInput): HealthResult {
  const problems: string[] = [];
  const warnings: string[] = [];
  const live = i.deployment === "production";
  if (!i.flagOn) problems.push("FEATURE_ONLINE_PAYMENTS is not on.");
  if (i.provider !== "CASHFREE") problems.push("Cashfree is not configured (set CASHFREE_APP_ID and CASHFREE_SECRET_KEY).");
  if (live && i.cashfreeEnv === "sandbox") problems.push("CASHFREE_ENV is sandbox on the production deployment: real customers cannot pay.");
  if (!live && i.cashfreeEnv === "production") problems.push("CASHFREE_ENV is production on a test deployment: use sandbox keys outside production.");
  const https = i.appUrl.startsWith("https://");
  if (!https) (live ? problems : warnings).push(live ? "The app URL is not https: Cashfree webhooks cannot reach it." : "The app URL is not https: Cashfree cannot call the webhook; the return page recheck still confirms bookings.");
  if (!i.cronSecretSet) (live ? problems : warnings).push("CRON_SECRET is not set: lapsed holds are not swept.");
  if (!i.receiptCompanyDetailsSet) warnings.push("CALVY_LEGAL_NAME / CALVY_ADDRESS are not set: receipts say \"Receipt details not configured\".");
  return { ready: problems.length === 0, mode: i.cashfreeEnv, problems, warnings };
}
