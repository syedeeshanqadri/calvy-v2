import { signTicket, verifyTicket } from "@/lib/signedTicket";

/**
 * Google sign-in rules (pure, unit-tested). An email address alone never links a Google login to an existing
 * password account: the owner logs in with the password first and then chooses "Link Google" in settings.
 */
export type GoogleExisting = { id: string; password: string | null; googleId: string | null };
export type GoogleDecision =
  | { action: "create" }
  | { action: "allow" }
  | { action: "link" }
  | { action: "deny"; reason: "unverified" | "password-account" | "other-google" };

export function decideGoogleSignIn(i: {
  emailVerified: boolean;
  sub: string;
  existing: GoogleExisting | null;
  /** The user id that started "Link Google" while logged in (from the signed cookie), if any. */
  linkIntentUserId: string | null;
}): GoogleDecision {
  if (!i.emailVerified) return { action: "deny", reason: "unverified" };
  const e = i.existing;
  if (!e) return { action: "create" };
  if (e.googleId) return e.googleId === i.sub ? { action: "allow" } : { action: "deny", reason: "other-google" };
  if (i.linkIntentUserId === e.id) return { action: "link" };
  // A password account is never taken over by email match. Accounts with no password were created by an
  // earlier Google/Facebook sign-up and have nothing to protect, so they keep working and get linked.
  if (e.password) return { action: "deny", reason: "password-account" };
  return { action: "link" };
}

export const LINK_COOKIE = "calvy_link_google";
export const LINK_TTL_MS = 10 * 60_000;

/** A short-lived signed token that says "this logged-in user asked to link Google". */
export function signLinkIntent(userId: string, secret: string, now = Date.now()): string {
  return signTicket("link-google", userId, secret, LINK_TTL_MS, now);
}

export function verifyLinkIntent(value: string | undefined | null, secret: string, now = Date.now()): string | null {
  return verifyTicket("link-google", value, secret, now);
}
