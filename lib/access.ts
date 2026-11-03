// The one server-side gate for team permissions. Every dashboard page, server action and API route
// that a team member may use goes through here. The member row is read from the DB on EVERY call
// (never from the JWT), so revoking a permission or removing a member takes effect immediately.
// Members have no `businessId` in their JWT, so any route that was not converted to this helper
// refuses them by default (owner-only).
import { getServerSession, type Session } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can, ForbiddenError, PERMISSIONS, sanitizePermissions, appointmentScope, type AppointmentScope, type Permission } from "@/lib/permissions";

export interface Access {
  userId: string;
  businessId: string;
  isOwner: boolean;
  permissions: Permission[];
  staffId: string | null;
  roleName: string;
}

export type AccessSession = Session & { user: Session["user"] & { businessId: string }; access: Access };

/** Resolve who this session is for the business. Null when the session is nobody's team login. */
export async function resolveAccess(session: Session | null): Promise<Access | null> {
  const u = session?.user;
  if (!u || u.kind === "customer") return null;
  if (u.businessId) {
    return { userId: u.id ?? "", businessId: u.businessId, isOwner: true, permissions: [...PERMISSIONS], staffId: null, roleName: "Owner" };
  }
  if (!u.id) return null;
  const m = await prisma.teamMember.findUnique({ where: { userId: u.id } });
  if (!m) return null;
  return { userId: u.id, businessId: m.businessId, isOwner: false, permissions: sanitizePermissions(m.permissions), staffId: m.staffId, roleName: m.roleName };
}

type Need = Permission | readonly Permission[] | "owner";

function allowed(a: Access, need: Need | undefined): boolean {
  if (need === undefined) return true;
  if (need === "owner") return a.isOwner;
  return a.isOwner || can(a.permissions, need);
}

/**
 * For API routes. Returns a session-shaped object (so existing handler code keeps working) with the
 * business id filled in and `access` attached. Returns null when not signed in (the route's 401) and
 * throws ForbiddenError (safeRoute -> 403) when signed in without the permission.
 */
export async function accessSession(need?: Need): Promise<AccessSession | null> {
  const session = await getServerSession(authOptions);
  const access = await resolveAccess(session);
  if (!session || !access) return null;
  if (!allowed(access, need)) throw new ForbiddenError();
  return { ...session, user: { ...session.user, businessId: access.businessId }, access };
}

/** For pages and server actions: sends the visitor to sign in, or back to the dashboard when not allowed. */
export async function pageAccess(need?: Need): Promise<AccessSession> {
  const session = await getServerSession(authOptions);
  const access = await resolveAccess(session);
  if (!session || !access) redirect("/login");
  if (!allowed(access, need)) redirect("/dashboard");
  return { ...session, user: { ...session.user, businessId: access.businessId }, access };
}

/** Appointment visibility for this person. Own-only members see only their linked staff record's appointments. */
export function scopeOf(access: Access): AppointmentScope {
  return access.isOwner ? { kind: "all" } : appointmentScope(access.permissions, access.staffId);
}

/** Prisma `where` additions for appointment reads; a "none" scope (or own-only without a linked staff) matches nothing. */
export function appointmentWhere(access: Access): { staffId?: string } {
  const s = scopeOf(access);
  if (s.kind === "all") return {};
  if (s.kind === "own" && s.staffId) return { staffId: s.staffId };
  return { staffId: "__none__" };
}
