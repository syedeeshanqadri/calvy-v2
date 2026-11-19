/**
 * The credentials providers registered in lib/auth.ts, by id. A credentials sign-in has already been checked by that provider's own authorize(),
 * so the signIn callback lets exactly these through. Keep in step with the CredentialsProvider list in lib/auth.ts (a test pins both).
 */
export const CREDENTIALS_PROVIDER_IDS = ["credentials", "signup-ticket", "customer"] as const;

export function isOurCredentialsLogin(account: { type?: string; provider?: string } | null | undefined): boolean {
  return account?.type === "credentials" && (CREDENTIALS_PROVIDER_IDS as readonly string[]).includes(account.provider ?? "");
}
