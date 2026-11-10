import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { adminState, type AdminContext } from "@/lib/admin/auth";
import { ADMIN_COOKIE } from "@/lib/admin/constants";
import { adminAudit } from "@/lib/admin/audit";

// Hooks that safeRoute runs around EVERY API handler. They cost nothing for normal traffic (they look for the admin cookie
// first) and give the view-as rules one place to live:
//   READ view-as  -> every write is refused here, on the server (only Exit, logout and re-auth still work);
//   ACT view-as   -> every successful write is recorded in the admin audit log AND in the business's own activity log;
//   admin APIs    -> every successful write is recorded (the ones that audit themselves are skipped).
const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);
// NextAuth (/api/auth: sign out, session) must keep working in a read-only view-as.
const READ_ALLOWED = ["/api/admin/view-as/exit", "/api/admin/logout", "/api/admin/2fa/reauth", "/api/auth"];
// Owner-only areas (payment and payout settings, billing, team, account) can never be changed while viewing as a business, even in ACT mode.
const ACT_FORBIDDEN = ["/api/settings/payout", "/api/settings/payments", "/api/razorpay", "/api/wallet", "/api/billing", "/api/team", "/api/account"];
const SELF_AUDITED = ["/api/admin/businesses", "/api/admin/view-as", "/api/admin/2fa", "/api/admin/logout", "/api/admin/settings/limits"];

export interface WriteTrace { ctx: AdminContext; method: string; path: string; viewAs: AdminContext["viewAs"] }

const hasAdminCookie = (req: Request) => (req.headers.get("cookie") ?? "").includes(`${ADMIN_COOKIE}=`);
const startsWithAny = (path: string, list: string[]) => list.some((p) => path === p || path.startsWith(p + "/"));

/** A short human label for the owner's activity log: "/api/services/abc" -> "services". */
export function sectionOf(path: string): string {
  const seg = path.replace(/^\/api\//, "").split("/").filter(Boolean)[0] ?? "settings";
  return seg.replace(/-/g, " ");
}

/** The one rule for a write during a view-as (pure): READ blocks everything but exit/logout/re-auth; ACT blocks owner-only areas. */
export function viewAsBlock(mode: "READ" | "ACT" | undefined, method: string, path: string): NextResponse | null {
  if (!mode || SAFE.has(method)) return null;
  if (mode === "READ" && !startsWithAny(path, READ_ALLOWED)) {
    return NextResponse.json({ error: "You are viewing this business read-only. Exit view-as to make changes.", code: "VIEW_AS_READ_ONLY" }, { status: 403 });
  }
  if (mode === "ACT" && startsWithAny(path, ACT_FORBIDDEN)) {
    return NextResponse.json({ error: "Owner-only areas (payments, billing, team) cannot be changed while acting as a business.", code: "ADMIN_AREA_FORBIDDEN" }, { status: 403 });
  }
  return null;
}

export async function adminWriteGate(req: Request): Promise<{ block: NextResponse } | { trace: WriteTrace | null }> {
  if (SAFE.has(req.method) || !hasAdminCookie(req)) return { trace: null };
  const st = await adminState();
  if (st.state !== "ok") return { trace: null }; // not (or no longer) an admin session: the route's own checks apply
  const path = new URL(req.url).pathname;
  const { viewAs } = st.ctx;
  const blocked = viewAsBlock(viewAs?.mode, req.method, path);
  if (blocked) return { block: blocked };
  return { trace: { ctx: st.ctx, method: req.method, path, viewAs } };
}

export async function recordAdminWrite(trace: WriteTrace, status: number): Promise<void> {
  if (status >= 400) return;
  const { ctx, method, path, viewAs } = trace;
  try {
    if (path.startsWith("/api/admin/") || path.startsWith("/api/crm/")) {
      if (startsWithAny(path, SELF_AUDITED)) return;
      await adminAudit(prisma, ctx.user, { action: "admin.api", detail: { method, path, status } });
      return;
    }
    if (viewAs?.mode === "ACT") {
      await prisma.$transaction(async (tx) => {
        await adminAudit(tx, ctx.user, { action: "act_as.edit", businessId: viewAs.businessId, reason: viewAs.reason, detail: { method, path, status } });
        // The owner sees what support changed, under the name "Calvy admin" (never the admin's identity).
        await tx.auditLog.create({
          data: { businessId: viewAs.businessId, actorId: "calvy-admin", action: "admin.edit", target: sectionOf(path), detail: JSON.stringify({ method, reason: viewAs.reason }) },
        });
      });
    }
  } catch (err) {
    logger.error("[admin] audit write failed", { err });
  }
}
