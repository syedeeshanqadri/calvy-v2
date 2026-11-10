import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { adminAudit, type AdminActor } from "@/lib/admin/audit";
import { ADMIN_COOKIE, ADMIN_IDLE_MS, REAUTH_WINDOW_MS, VIEW_AS_MS, hashToken } from "@/lib/admin/constants";

// The ONE gate for everything under /admin, /api/admin and /crm. Super admin is a database flag on the user (set only by
// `npm run admin:grant`). Beyond the flag, an admin needs a valid ADMIN SESSION: created after an authenticator-app code,
// ended after 30 minutes idle, and sensitive actions need a TOTP check within the last 5 minutes.
export { ADMIN_COOKIE, ADMIN_IDLE_MS, REAUTH_WINDOW_MS, VIEW_AS_MS, hashToken };

export interface ViewAs { businessId: string; mode: "READ" | "ACT"; reason: string; startedAt: Date; expiresAt: Date }
export interface AdminContext {
  user: AdminActor & { name: string };
  sessionId: string;
  reauthAt: Date;
  viewAs: ViewAs | null;
}

export type AdminState =
  | { state: "none" }                                   // not a super admin (or not signed in): the world sees a 404
  | { state: "needs2fa"; user: AdminActor & { name: string }; enrolled: boolean } // super admin, no valid admin session yet
  | { state: "ok"; ctx: AdminContext };

/** Super admin check from the DATABASE on every call (the JWT is never trusted for this). */
async function superAdminUser() {
  const session = await getServerSession(authOptions);
  const id = session?.user?.id;
  if (!id || session.user.kind === "customer") return null;
  const u = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true, name: true, isSuperAdmin: true, adminTotpEnabledAt: true } });
  return u?.isSuperAdmin ? u : null;
}

export async function adminState(now = new Date()): Promise<AdminState> {
  const u = await superAdminUser();
  if (!u) return { state: "none" };
  const user = { id: u.id, email: u.email, name: u.name };
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  const s = token ? await prisma.adminSession.findUnique({ where: { tokenHash: hashToken(token) } }) : null;
  if (!s || s.userId !== u.id || s.endedAt || now.getTime() - s.lastSeenAt.getTime() > ADMIN_IDLE_MS) {
    if (s && !s.endedAt) await prisma.adminSession.update({ where: { id: s.id }, data: { endedAt: now } }).catch(() => {});
    return { state: "needs2fa", user, enrolled: !!u.adminTotpEnabledAt };
  }
  // Idle clock: touch at most once a minute.
  if (now.getTime() - s.lastSeenAt.getTime() > 60_000) await prisma.adminSession.update({ where: { id: s.id }, data: { lastSeenAt: now } }).catch(() => {});

  let viewAs: ViewAs | null = null;
  if (s.viewAsBusinessId && s.viewAsMode && s.viewAsExpiresAt) {
    if (s.viewAsExpiresAt <= now) await closeViewAs(s.id, user, "expired", now); // the lapse is recorded, once
    else viewAs = { businessId: s.viewAsBusinessId, mode: s.viewAsMode === "ACT" ? "ACT" : "READ", reason: s.viewAsReason ?? "", startedAt: s.viewAsStartedAt ?? s.createdAt, expiresAt: s.viewAsExpiresAt };
  }
  return { state: "ok", ctx: { user, sessionId: s.id, reauthAt: s.reauthAt, viewAs } };
}

/** End the session's view-as (exit button or expiry) and write the matching audit row. Safe to call twice. */
export async function closeViewAs(sessionId: string, actor: AdminActor, how: "exit" | "expired", now = new Date()): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const s = await tx.adminSession.findUnique({ where: { id: sessionId } });
    if (!s?.viewAsBusinessId) return false;
    const claimed = await tx.adminSession.updateMany({
      where: { id: sessionId, viewAsBusinessId: s.viewAsBusinessId },
      data: { viewAsBusinessId: null, viewAsMode: null, viewAsReason: null, viewAsStartedAt: null, viewAsExpiresAt: null, viewAsAuditId: null },
    });
    if (claimed.count !== 1) return false;
    const act = s.viewAsMode === "ACT";
    await adminAudit(tx, actor, {
      action: how === "expired" ? (act ? "act_as.expired" : "view_as.expired") : (act ? "act_as.end" : "view_as.end"),
      businessId: s.viewAsBusinessId, reason: s.viewAsReason,
      detail: { minutes: s.viewAsStartedAt ? Math.round((now.getTime() - s.viewAsStartedAt.getTime()) / 60_000) : null, startedAuditId: s.viewAsAuditId },
    });
    return true;
  });
}

/** Create the admin session after a good TOTP (or recovery) code and set its cookie. */
export async function startAdminSession(userId: string, now = new Date()): Promise<void> {
  const token = randomBytes(32).toString("hex");
  await prisma.adminSession.updateMany({ where: { userId, endedAt: null }, data: { endedAt: now } }); // one live session per admin
  await prisma.adminSession.create({ data: { userId, tokenHash: hashToken(token), reauthAt: now } });
  (await cookies()).set(ADMIN_COOKIE, token, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/" });
}

export async function endAdminSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(ADMIN_COOKIE)?.value;
  if (token) {
    const s = await prisma.adminSession.findUnique({ where: { tokenHash: hashToken(token) }, select: { id: true, userId: true } });
    if (s) {
      const u = await prisma.user.findUnique({ where: { id: s.userId }, select: { id: true, email: true } });
      if (u) await closeViewAs(s.id, u, "exit").catch(() => {});
      await prisma.adminSession.update({ where: { id: s.id }, data: { endedAt: new Date() } }).catch(() => {});
    }
  }
  jar.delete(ADMIN_COOKIE);
}

/** Pages and layouts: non-admins get the same 404 as a page that does not exist; an admin without a session goes to the 2FA page. */
export async function requireAdminPage(): Promise<AdminContext> {
  const st = await adminState();
  if (st.state === "none") notFound();
  if (st.state === "needs2fa") redirect("/admin/2fa");
  return st.ctx;
}

/** API routes: 404 for everyone who is not a super admin, 401 {code} for an admin who must verify 2FA first. */
export async function requireAdminApi(): Promise<{ ok: true; ctx: AdminContext } | { ok: false; res: NextResponse }> {
  const st = await adminState();
  if (st.state === "none") return { ok: false, res: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  if (st.state === "needs2fa") return { ok: false, res: NextResponse.json({ error: "Verify your authenticator code first.", code: "ADMIN_2FA_REQUIRED" }, { status: 401 }) };
  return { ok: true, ctx: st.ctx };
}

/** Sensitive actions: a TOTP check within the last 5 minutes, else 428 so the screen asks for a code. */
export function needsReauth(ctx: AdminContext, now = new Date()): NextResponse | null {
  if (now.getTime() - ctx.reauthAt.getTime() <= REAUTH_WINDOW_MS) return null;
  return NextResponse.json({ error: "Enter a fresh authenticator code to continue.", code: "ADMIN_REAUTH_REQUIRED" }, { status: 428 });
}

/** Reason for an action: required, trimmed, at least 8 characters. */
export function cleanReason(v: unknown): string | null {
  const r = typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "";
  return r.length >= 8 && r.length <= 500 ? r : null;
}

/** For the 2FA endpoints only: the signed-in super admin (flag from the database) with their 2FA fields, or null (-> 404). */
export async function twoFaUser() {
  const session = await getServerSession(authOptions);
  const id = session?.user?.id;
  if (!id || session.user.kind === "customer") return null;
  const u = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true, name: true, isSuperAdmin: true, adminTotpSecret: true, adminTotpEnabledAt: true, adminTotpLastStep: true, adminRecoveryHashes: true } });
  return u?.isSuperAdmin ? u : null;
}
