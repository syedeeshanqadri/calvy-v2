import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export type AuditAction = "team.member_added" | "team.member_removed" | "team.permissions_changed" | "team.invite_resent" | "team.invite_revoked" | "team.invite_accepted" | "settings.payments_changed";

/** Append-only record of who did what in a business. A failed write is logged, never thrown. */
export async function audit(entry: { businessId: string; actorId: string; action: AuditAction; target?: string; detail?: unknown }): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        businessId: entry.businessId, actorId: entry.actorId, action: entry.action,
        target: entry.target ?? null, detail: entry.detail === undefined ? null : JSON.stringify(entry.detail),
      },
    });
  } catch (err) {
    logger.error("[audit] write failed", { err });
  }
}
