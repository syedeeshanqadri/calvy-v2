// Team member lifecycle (DB side). Callers have already checked the caller is the business owner.
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications/enqueue";
import { teamInviteEmail } from "@/lib/notifications/events";
import { createInviteToken, isUsableInvite } from "@/lib/teamInvite";
import { hashToken } from "@/lib/auth-tokens";
import { logger } from "@/lib/logger";
import { sanitizePermissions } from "@/lib/permissions";

export function serializeMember(m: { id: string; email: string; name: string; roleName: string; permissions: string[]; staffId: string | null; userId: string | null; createdAt: Date }) {
  return { id: m.id, email: m.email, name: m.name, roleName: m.roleName, permissions: sanitizePermissions(m.permissions), staffId: m.staffId, status: (m.userId ? "active" : "invited") as "active" | "invited", createdAt: m.createdAt.toISOString() };
}


/** Revoke any open invite for the member, create a fresh one and email it. Returns the raw token (for tests only). */
export async function issueInvite(member: { id: string; email: string; name: string; roleName: string; businessId: string }, baseUrl?: string): Promise<string> {
  const { token, tokenHash, expiresAt } = createInviteToken();
  const now = new Date();
  await prisma.$transaction([
    prisma.teamInvite.updateMany({ where: { memberId: member.id, usedAt: null, revokedAt: null }, data: { revokedAt: now } }),
    prisma.teamInvite.create({ data: { memberId: member.id, tokenHash, expiresAt } }),
  ]);
  const biz = await prisma.business.findUnique({ where: { id: member.businessId }, select: { name: true } });
  try {
    await notify(teamInviteEmail({ memberId: member.id, to: member.email, name: member.name, businessName: biz?.name ?? "your team", roleName: member.roleName, token, baseUrl }));
  } catch (err) {
    logger.error("[team] invite email failed", { err });
  }
  return token;
}

export type AcceptResult = { ok: true } | { ok: false };

/** Redeem an invite: single use (claimed atomically), 48h expiry, creates the login with the chosen password. */
export async function acceptInvite(token: string, password: string): Promise<AcceptResult> {
  const rec = await prisma.teamInvite.findUnique({ where: { tokenHash: hashToken(token) }, include: { member: true } });
  const now = new Date();
  if (!rec || !isUsableInvite(rec, now) || rec.member.userId) return { ok: false };
  const hashed = await bcrypt.hash(password, 12);
  try {
    return await prisma.$transaction(async (tx) => {
      const claimed = await tx.teamInvite.updateMany({ where: { id: rec.id, usedAt: null, revokedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
      if (claimed.count !== 1) return { ok: false as const };
      const user = await tx.user.create({
        data: { name: rec.member.name, email: rec.member.email, password: hashed, role: "member", emailVerified: now, passwordChangedAt: now },
      });
      await tx.teamMember.update({ where: { id: rec.member.id }, data: { userId: user.id } });
      return { ok: true as const };
    });
  } catch (err) {
    logger.error("[team] accept failed", { err });
    return { ok: false };
  }
}

/** Remove a member: their login is deleted, so every session of theirs is refused from the next request. */
export async function removeMember(memberId: string, businessId: string): Promise<{ email: string } | null> {
  const m = await prisma.teamMember.findFirst({ where: { id: memberId, businessId } });
  if (!m) return null;
  await prisma.$transaction([
    // Their phones stop getting alerts at once (also covered by the cascade when the login is deleted).
    ...(m.userId ? [prisma.pushDevice.deleteMany({ where: { userId: m.userId } })] : []),
    prisma.teamMember.delete({ where: { id: m.id } }),
    ...(m.userId ? [prisma.user.deleteMany({ where: { id: m.userId, role: "member" } })] : []),
  ]);
  return { email: m.email };
}
