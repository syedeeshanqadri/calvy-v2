import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { ADMIN_COOKIE, ADMIN_IDLE_MS, hashToken } from "@/lib/admin/constants";

/**
 * The active view-as for a signed-in user id, or null. Read from the database on every call: the user must still be a super
 * admin, the admin session must be live (not ended, not idle past 30 minutes) and the view-as must not have expired.
 * (Kept out of lib/admin/auth.ts so the NextAuth session callback can use it without a circular import.)
 */
export async function activeViewAs(userId: string | undefined, now = new Date()) {
  if (!userId) return null;
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  return viewAsForToken(userId, token, now);
}

/** Same lookup from an explicit cookie value (the proxy has no next/headers). */
export async function viewAsForToken(userId: string | undefined, token: string | undefined, now = new Date()) {
  if (!userId || !token) return null;
  const s = await prisma.adminSession.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!s || s.userId !== userId || s.endedAt || !s.viewAsBusinessId || !s.viewAsMode || !s.viewAsExpiresAt) return null;
  if (s.viewAsExpiresAt <= now || now.getTime() - s.lastSeenAt.getTime() > ADMIN_IDLE_MS) return null;
  const admin = await prisma.user.findUnique({ where: { id: userId }, select: { isSuperAdmin: true } });
  if (!admin?.isSuperAdmin) return null;
  const b = await prisma.business.findUnique({ where: { id: s.viewAsBusinessId }, select: { id: true, slug: true, name: true } });
  if (!b) return null;
  return { businessId: b.id, slug: b.slug, name: b.name, mode: (s.viewAsMode === "ACT" ? "ACT" : "READ") as "READ" | "ACT", expiresAt: s.viewAsExpiresAt };
}
