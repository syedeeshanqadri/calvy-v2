// Business-side WhatsApp alerts: to the owner's and team members' OWN numbers, opt-in per person, with exactly the
// rules phone alerts use (lib/pushRouting.ts): permission decides what you MAY get, your preference what you WANT.
import { prisma } from "@/lib/prisma";
import { sanitizePermissions } from "@/lib/permissions";
import { mayReceive, wants, type PushKind, type PushPrefs } from "@/lib/pushRouting";
import { STAFF_ALERT_KINDS } from "@/lib/whatsapp/events";
import { normalizePhone } from "@/lib/phone";

export const normalizeStaffPhone = (raw: string, tz: string | null | undefined) => normalizePhone(raw, tz);

/** People of this business who opted in, verified their number, may see this kind and want it. */
export async function eligibleWhatsAppUsers(businessId: string, kind: PushKind, bookingStaffId: string | null | undefined) {
  if (!STAFF_ALERT_KINDS.has(kind)) return [];
  const cfg = await prisma.whatsAppConfig.findUnique({ where: { businessId }, select: { status: true } });
  if (cfg?.status !== "CONNECTED") return [];
  const [business, members] = await Promise.all([
    prisma.business.findUnique({ where: { id: businessId }, select: { ownerId: true } }),
    prisma.teamMember.findMany({ where: { businessId }, select: { userId: true, permissions: true, staffId: true } }),
  ]);
  if (!business) return [];
  const active = members.filter((m): m is typeof m & { userId: string } => !!m.userId);
  const byUser = new Map(active.map((m) => [m.userId, m]));
  const users = await prisma.user.findMany({
    where: { id: { in: [business.ownerId, ...active.map((m) => m.userId)] }, whatsappOptIn: true, whatsappVerifiedAt: { not: null }, whatsappPhone: { not: null } },
    select: { id: true, whatsappPhone: true, pushPreference: true },
  });
  return users.filter((u) => {
    const isOwner = u.id === business.ownerId;
    const m = byUser.get(u.id);
    if (!isOwner && !m) return false;
    const allowed = mayReceive(kind, { isOwner, permissions: m ? sanitizePermissions(m.permissions) : [], staffId: m?.staffId ?? null }, bookingStaffId);
    return allowed && wants(kind, u.pushPreference as Partial<PushPrefs> | null);
  });
}
