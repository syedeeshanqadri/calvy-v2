import type { BrowserContext } from "@playwright/test";
import { encode } from "next-auth/jwt";
import { ADMIN_COOKIE_NAME, type AdminFixture, E2E_ADMIN_EMAIL } from "../../../scripts/e2e-admin-fixture";

/**
 * Sign a browser context in as the fixture super admin.
 *
 * The fixture user has no password, so the only way in is a session cookie. The cookie is minted here, in the test process, with the app's own
 * NEXTAUTH_SECRET (read from the environment, never printed or written anywhere) and a 15-minute lifetime. It carries no more than a real sign-in
 * would: the user id and email. The admin gate itself is untouched: the app still checks the database for the super-admin flag AND a live admin
 * session row (the `calvy_admin` cookie below), on every request.
 */
export async function signInAsFixtureAdmin(context: BrowserContext, baseURL: string, f: AdminFixture): Promise<void> {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is not set for this test run");
  const jwt = await encode({
    token: { sub: f.userId, uid: f.userId, name: "E2E Admin", email: E2E_ADMIN_EMAIL, sa: true, ev: true, bizCheckedAt: Date.now() },
    secret, maxAge: 15 * 60,
  });
  const url = new URL(baseURL);
  const secure = url.protocol === "https:";
  await context.addCookies([
    { name: secure ? "__Secure-next-auth.session-token" : "next-auth.session-token", value: jwt, domain: url.hostname, path: "/", httpOnly: true, sameSite: "Lax", secure },
    { name: ADMIN_COOKIE_NAME, value: f.adminToken, domain: url.hostname, path: "/", httpOnly: true, sameSite: "Lax", secure },
  ]);
}
