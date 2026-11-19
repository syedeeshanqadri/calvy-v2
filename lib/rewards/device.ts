// A browser id for the "same device" referral check: a random first-party cookie, stored only as a hash. Best effort by nature (clearing
// cookies resets it), so it is one of several checks and never the only one.
import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";

const COOKIE = "calvy_dev";

/** The hash of this browser's id, creating the cookie on first sight. Null when cookies cannot be read or set (never blocks a booking). */
export async function deviceHash(): Promise<string | null> {
  try {
    const jar = await cookies();
    let id = jar.get(COOKIE)?.value;
    if (!id || !/^[a-f0-9]{32}$/.test(id)) {
      id = randomBytes(16).toString("hex");
      jar.set(COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365, path: "/" });
    }
    return createHash("sha256").update(`calvy-dev:${id}`).digest("hex").slice(0, 32);
  } catch {
    return null;
  }
}
