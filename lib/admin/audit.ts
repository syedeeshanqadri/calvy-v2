import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Db = typeof prisma | Prisma.TransactionClient;

/** Admin audit actions. The table is append-only (a database trigger refuses UPDATE and DELETE). */
export type AdminAction =
  | "2fa.enrolled" | "2fa.verified" | "2fa.recovery_used" | "2fa.failed" | "reauth"
  | "view_as.start" | "view_as.end" | "view_as.expired" | "act_as.start" | "act_as.end" | "act_as.expired" | "act_as.edit"
  | "business.create" | "business.edit" | "business.suspend" | "business.unsuspend"
  | "business.plan_override" | "business.plan_override_clear" | "business.resend_setup_email" | "business.resend_live_email" | "business.reset_onboarding"
  | "settings.limits_changed" | "settings.app_changed" | "admin.api";

export interface AdminActor { id: string; email: string }

/**
 * Write one audit row. Callers that change data pass their transaction client so the change and its audit row commit
 * together. Never put customer contact details or credentials in `detail`.
 */
export async function adminAudit(
  db: Db,
  actor: AdminActor,
  entry: { action: AdminAction; businessId?: string | null; reason?: string | null; detail?: unknown },
): Promise<string> {
  const row = await db.adminAuditLog.create({
    data: {
      adminId: actor.id, adminEmail: actor.email, action: entry.action,
      businessId: entry.businessId ?? null, reason: entry.reason ?? null,
      detail: entry.detail === undefined ? null : JSON.stringify(entry.detail).slice(0, 4000),
    },
    select: { id: true },
  });
  return row.id;
}
