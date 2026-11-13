import type { NotificationOutbox } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { enqueue, sendSoon, type NotificationInput } from "@/lib/notifications/enqueue";
import { sanitizePermissions } from "@/lib/permissions";
import { mayReceive, scrubContact, wants, type PushKind, type PushPrefs } from "@/lib/pushRouting";
import { logger } from "@/lib/logger";
import { eligibleWhatsAppUsers } from "@/lib/whatsapp/staff";

export interface PushMessage { title: string; body: string; url?: string; tag?: string }

/** Who, among a business's registered devices, may and wants to get this kind right now. */
async function eligibleDevices(businessId: string, kind: PushKind, bookingStaffId: string | null | undefined) {
  const [business, devices] = await Promise.all([
    prisma.business.findUnique({ where: { id: businessId }, select: { ownerId: true } }),
    prisma.pushDevice.findMany({
      where: { businessId },
      select: { id: true, userId: true, user: { select: { pushPreference: true, teamMember: { select: { businessId: true, permissions: true, staffId: true } } } } },
    }),
  ]);
  return devices.filter((d) => {
    const isOwner = business?.ownerId === d.userId;
    const m = d.user.teamMember && d.user.teamMember.businessId === businessId ? d.user.teamMember : null;
    if (!isOwner && !m) return false; // neither the owner nor a member of this business (stale row): never
    const allowed = mayReceive(kind, { isOwner, permissions: m ? sanitizePermissions(m.permissions) : [], staffId: m?.staffId ?? null }, bookingStaffId);
    return allowed && wants(kind, d.user.pushPreference as Partial<PushPrefs> | null);
  });
}

/**
 * Queue one phone alert per eligible device through the notification outbox (retries, idempotency, delivery log).
 * `subjectId` + `version` make repeats of the same event one alert per device. Never throws: a failed alert must not fail a booking.
 */
export async function queuePush(p: { businessId: string; kind: PushKind; staffId?: string | null; subjectId: string; version?: string | number; message: PushMessage }): Promise<number> {
  try {
    const [devices, waUsers] = await Promise.all([eligibleDevices(p.businessId, p.kind, p.staffId), eligibleWhatsAppUsers(p.businessId, p.kind, p.staffId)]);
    if (!devices.length && !waUsers.length) return 0;
    const payload = { title: scrubContact(p.message.title).slice(0, 80), body: scrubContact(p.message.body).slice(0, 160), url: p.message.url ?? "/dashboard", tag: p.message.tag ?? p.kind, kind: p.kind, staffId: p.staffId ?? null };
    const items: NotificationInput[] = [
      ...devices.map((d): NotificationInput => ({
        event: `push.${p.kind}`, audience: "BUSINESS", subjectId: p.subjectId, version: p.version, channel: "PUSH", recipient: d.id,
        template: "push", payload: { ...payload, userId: d.userId }, businessId: p.businessId,
      })),
      // The same alert on WhatsApp, to each opted-in person's own number (gates are re-checked at send: lib/whatsapp/send.ts).
      ...waUsers.map((u): NotificationInput => ({
        event: `push.${p.kind}`, audience: "BUSINESS", subjectId: p.subjectId, version: p.version, channel: "WHATSAPP", recipient: u.whatsappPhone as string,
        template: "whatsapp_alert", payload: { ...payload, userId: u.id }, businessId: p.businessId,
      })),
    ];
    const ids = await enqueue(prisma, items);
    await sendSoon(ids);
    return items.length;
  } catch (err) {
    logger.error("[push] queue failed", { err });
    return 0;
  }
}

/** The outbox checks this again at send time: the device may be gone, or the person's access or choice may have changed since it was queued. */
export async function pushSendBlocker(row: Pick<NotificationOutbox, "recipient" | "businessId" | "payload">): Promise<string | null> {
  const payload = row.payload as { kind?: PushKind; staffId?: string | null; userId?: string };
  const device = await prisma.pushDevice.findUnique({ where: { id: row.recipient }, select: { id: true, userId: true, businessId: true } });
  if (!device) return "device removed";
  if (!row.businessId || device.businessId !== row.businessId) return "device belongs to another business";
  if (!payload.kind || device.userId !== payload.userId) return "device changed owner";
  const ok = (await eligibleDevices(row.businessId, payload.kind, payload.staffId)).some((d) => d.id === device.id);
  return ok ? null : "no longer allowed or switched off";
}

/** Remove every phone registered to one user (logout, removal, revoked permission). */
export async function removeUserDevices(userId: string): Promise<number> {
  const { count } = await prisma.pushDevice.deleteMany({ where: { userId } });
  return count;
}
