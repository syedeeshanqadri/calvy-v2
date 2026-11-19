// "Remember this device": after a verified booking (or a member sign-in link), a signed, httpOnly cookie lets this browser's later bookings
// count as verified for 90 days, so the member price needs no new sign-in. The cookie holds only a signed customer id and an expiry; it is
// checked against the customer's own verified email on every booking (see isVerifiedBooker), so it never lends status to someone else's email.
import { cookies } from "next/headers";
import { signTicket } from "@/lib/signedTicket";
import { usesTenantSubdomains } from "@/lib/siteBase";

export const DEVICE_PURPOSE = "verified-device";
export const DEVICE_COOKIE = "calvy_member";
export const DEVICE_TTL_MS = 90 * 24 * 3_600_000;

export const signDeviceTicket = (customerId: string, now = Date.now()) => signTicket(DEVICE_PURPOSE, customerId, process.env.NEXTAUTH_SECRET ?? "", DEVICE_TTL_MS, now);

/** The cookie's domain: the whole root domain on a real deployment (so any business site on a subdomain sees it), host-only elsewhere. */
function cookieDomain(): string | undefined {
  const root = (process.env.NEXT_PUBLIC_ROOT_DOMAIN || "calvy.io").replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, "");
  return usesTenantSubdomains(root) && process.env.NODE_ENV === "production" ? `.${root}` : undefined;
}

const options = () => ({ httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", domain: cookieDomain() });

/** The signed ticket in this browser's cookie, or null (never throws: a booking must work without it). */
export async function readDeviceTicket(): Promise<string | null> {
  try { return (await cookies()).get(DEVICE_COOKIE)?.value ?? null; } catch { return null; }
}

export async function setDeviceCookie(customerId: string): Promise<void> {
  try { (await cookies()).set(DEVICE_COOKIE, signDeviceTicket(customerId), { ...options(), maxAge: DEVICE_TTL_MS / 1000 }); } catch { /* no cookie jar here: nothing to remember */ }
}

export async function clearDeviceCookie(): Promise<void> {
  try { (await cookies()).set(DEVICE_COOKIE, "", { ...options(), maxAge: 0 }); } catch { /* nothing to clear */ }
}
