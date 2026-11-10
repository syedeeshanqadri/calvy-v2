import { cookies } from "next/headers";

/** Which PushDevice row is THIS browser's: an httpOnly cookie set when the device subscribes, read when the person signs out. */
export const PUSH_DEVICE_COOKIE = "calvy_push_device";

export const pushDeviceCookieOptions = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 };

/** The device id this browser registered, or null (no cookie, or called outside a request). */
export async function currentPushDeviceId(): Promise<string | null> {
  try {
    const v = (await cookies()).get(PUSH_DEVICE_COOKIE)?.value;
    return v && /^[\w-]{8,64}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}
