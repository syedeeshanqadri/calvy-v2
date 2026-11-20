// A signed, httpOnly cookie set in the browser that created an email sign-up. It lets a later verification tell "the same person, same browser" from
// "someone else on another device": only the latter ends other sessions (see lib/ownerTakeover.ts). The cookie proves nothing on its own: it is bound to
// one user id and signed, so it cannot be moved to another account.
import { cookies } from "next/headers";
import { signTicket, verifyTicket } from "@/lib/signedTicket";

export const SIGNUP_DEVICE_COOKIE = "calvy_signup_device";
export const SIGNUP_DEVICE_PURPOSE = "signup-device";
export const SIGNUP_DEVICE_TTL_MS = 90 * 86_400_000;

export function signupDeviceValue(userId: string, secret: string, now = Date.now()): string {
  return signTicket(SIGNUP_DEVICE_PURPOSE, userId, secret, SIGNUP_DEVICE_TTL_MS, now);
}

export const signupDeviceCookieOptions = () => ({ httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: SIGNUP_DEVICE_TTL_MS / 1000 });

/** Pure check: does this cookie value belong to this user? */
export function isSignupDevice(value: string | undefined | null, userId: string, secret: string, now = Date.now()): boolean {
  return verifyTicket(SIGNUP_DEVICE_PURPOSE, value, secret, now) === userId;
}

/** Is the browser making this request the one that created this account? False when there is no request context (a job) or no cookie. */
export async function createdOnThisDevice(userId: string): Promise<boolean> {
  try {
    return isSignupDevice((await cookies()).get(SIGNUP_DEVICE_COOKIE)?.value, userId, process.env.NEXTAUTH_SECRET ?? "");
  } catch {
    return false;
  }
}
