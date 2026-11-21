// A throwaway Calvy super admin for the Playwright runs that need to see /admin (visual smoke test and screenshots).
//
// It only WRITES ROWS to the database. The app is not changed in any way: no flag, no authenticator bypass, no test-only route. The admin gate in
// lib/admin/auth.ts is exactly what production runs; this fixture just supplies what a real sign-in would leave behind (a user, an admin session).
//
//   - The user is e2e-admin@calvy.test: a domain that cannot receive mail, NO password (nobody can type their way in), flagged super admin.
//   - The admin session lasts 15 minutes at most. Its random token exists only in memory, in the run that created it. It is never written to disk or a log.
//   - Everything it created (the user and its sessions) is deleted at the end of every run (try/finally), and by `wipe`.
//   - The admin AUDIT LOG is append-only by design (database triggers refuse update, delete and truncate), so this script never touches it. The specs only VIEW
//     pages, which writes no audit row; if a run ever does leave rows for the fixture admin, the run FAILS loudly (it cannot, and must not, delete them).
//   - It refuses to run when NODE_ENV=production, VERCEL is set, DATABASE_URL points at a host in PROD_DB_HOSTS (comma-separated denylist), or PROD_DB_HOSTS
//     is not set at all (an unset list would mean no protection). In CI it runs only against CI's own database on localhost.
//
//   npm run e2e:admin-fixture:wipe          (npx dotenv -e .env.local -- tsx scripts/e2e-admin-fixture.ts wipe)
import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";

export const E2E_ADMIN_EMAIL = "e2e-admin@calvy.test";
/** The admin cookie the app reads (lib/admin/constants.ts). */
export const ADMIN_COOKIE_NAME = "calvy_admin";
export const MAX_SESSION_MS = 15 * 60_000;

/** Pure: may this fixture run against this environment? Returns the reason it must not, or null. */
export function refusal(env: Record<string, string | undefined> = process.env): string | null {
  if (env.NODE_ENV === "production") return "NODE_ENV is production";
  if (env.VERCEL) return "VERCEL is set";
  const url = env.DATABASE_URL;
  if (!url) return "DATABASE_URL is not set";
  let host = "";
  try { host = new URL(url).hostname.toLowerCase(); } catch { return "DATABASE_URL is not a valid URL"; }
  if (env.CI) {
    // CI uses its own throwaway Postgres next to the job. Anything else (the shared dev database, production) is refused.
    return ["localhost", "127.0.0.1", "::1", "postgres"].includes(host) ? null : `CI may only use its own database on localhost (this one is ${host})`;
  }
  const deny = (env.PROD_DB_HOSTS ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  if (deny.length === 0) return "PROD_DB_HOSTS is not set: list the production database host(s), comma-separated, so this can refuse them";
  if (deny.some((h) => host === h || host.endsWith(`.${h}`) || host.includes(h))) return `DATABASE_URL points at a denied host (${host})`;
  return null;
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Delete the fixture user and its admin sessions. Safe to run any time, any number of times. Returns how many audit rows exist for it (they are append-only and are never deleted here). */
export async function wipeAdminFixture(prisma: PrismaClient): Promise<{ users: number; sessions: number; auditLeft: number }> {
  const user = await prisma.user.findUnique({ where: { email: E2E_ADMIN_EMAIL }, select: { id: true } });
  const auditLeft = await prisma.adminAuditLog.count({ where: { OR: [{ adminEmail: E2E_ADMIN_EMAIL }, ...(user ? [{ adminId: user.id }] : [])] } });
  if (!user) return { users: 0, sessions: 0, auditLeft };
  const sessions = await prisma.adminSession.deleteMany({ where: { userId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });
  return { users: 1, sessions: sessions.count, auditLeft };
}

export interface AdminFixture {
  userId: string;
  /** The value of the `calvy_admin` cookie. In memory only. */
  adminToken: string;
  /** Delete the admin session row only (the user stays): what an expired or revoked session looks like to the app. For the "no row, no access" test. */
  endSession: () => Promise<void>;
  wipe: () => Promise<{ users: number; sessions: number; auditLeft: number }>;
}

/** Create the fixture. Prefer withAdminFixture(), which always cleans up. */
export async function createAdminFixture(prisma: PrismaClient): Promise<AdminFixture> {
  const why = refusal();
  if (why) throw new Error(`e2e admin fixture refused: ${why}`);
  await wipeAdminFixture(prisma); // a crashed earlier run leaves nothing behind
  const now = new Date();
  const user = await prisma.user.create({ data: { name: "E2E Admin", email: E2E_ADMIN_EMAIL, password: null, emailVerified: now, isSuperAdmin: true } });
  const adminToken = randomBytes(32).toString("hex");
  await prisma.adminSession.create({ data: { userId: user.id, tokenHash: sha256(adminToken), reauthAt: now, lastSeenAt: now } });
  // The session is cut off after 15 minutes whatever happens (a stuck run included).
  const timer = setTimeout(() => { void wipeAdminFixture(prisma).catch(() => undefined); }, MAX_SESSION_MS);
  timer.unref?.();
  return { userId: user.id, adminToken, endSession: async () => { await prisma.adminSession.deleteMany({ where: { userId: user.id } }); }, wipe: async () => { clearTimeout(timer); return wipeAdminFixture(prisma); } };
}

/** Run `fn` with a fixture admin and ALWAYS remove it afterwards. */
export async function withAdminFixture<T>(fn: (f: AdminFixture) => Promise<T>): Promise<T> {
  const prisma = new PrismaClient();
  let fixture: AdminFixture | null = null;
  try {
    fixture = await createAdminFixture(prisma);
    return await fn(fixture);
  } finally {
    try {
      const left = fixture ? await fixture.wipe() : await wipeAdminFixture(prisma);
      if (left.auditLeft > 0) throw new Error(`the fixture admin left ${left.auditLeft} audit row(s). The audit log is append-only, so they cannot be removed: find what wrote them`);
    } finally { await prisma.$disconnect(); }
  }
}

// CLI: `tsx scripts/e2e-admin-fixture.ts wipe`
if (process.argv[1]?.endsWith("e2e-admin-fixture.ts") && process.argv[2] === "wipe") {
  const why = refusal();
  if (why) { console.error(`e2e admin fixture refused: ${why}`); process.exit(1); }
  const prisma = new PrismaClient();
  wipeAdminFixture(prisma)
    .then((r) => console.log(`wiped: ${r.users} user, ${r.sessions} sessions. Audit rows for the fixture admin (append-only, never deleted): ${r.auditLeft}`))
    .finally(() => prisma.$disconnect());
}
