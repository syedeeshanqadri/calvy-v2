// The WHATSAPP side of the notification outbox. Called by lib/notifications/process.ts for rows with channel WHATSAPP.
// A message goes out only when EVERY gate passes; any failed gate makes the row SKIPPED with the reason (the email, which
// always goes separately, is then the only message). Retries and idempotency come from the outbox row, as for email.
import type { NotificationOutbox } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getBusinessFeatures } from "@/lib/getFeatures";
import { resolvePrefs } from "@/lib/notifications/prefs";
import { isRetryableStatus } from "@/lib/notifications/policy";
import type { SendOutcome } from "@/lib/notifications/channels";
import { sanitizePermissions } from "@/lib/permissions";
import { mayReceive, wants, type PushKind, type PushPrefs } from "@/lib/pushRouting";
import { buildWhatsAppMessage, WA_EVENTS } from "@/lib/whatsapp/events";
import { sendTemplateMessage, type Fetcher } from "@/lib/whatsapp/graph";
import { credentialsOf, isOptedOut } from "@/lib/whatsapp/store";
import { TEMPLATE_LANGUAGES, templateName } from "@/lib/whatsapp/templates";

const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

/** Why this row must not go out as WhatsApp right now; null when every gate passes. Pure reads, no sending. */
export async function whatsappSendBlocker(row: Pick<NotificationOutbox, "businessId" | "event" | "audience" | "recipient" | "appointmentId" | "payload">): Promise<string | null> {
  if (!row.businessId) return "no business";
  const [cfg, business] = await Promise.all([
    prisma.whatsAppConfig.findUnique({ where: { businessId: row.businessId }, select: { status: true } }),
    prisma.business.findUnique({ where: { id: row.businessId }, select: { ownerId: true, notificationPrefs: true } }),
  ]);
  if (!cfg || !business) return "WhatsApp not set up";
  if (cfg.status !== "CONNECTED") return "WhatsApp connection needs attention (paused)";
  if (!(await getBusinessFeatures(row.businessId)).whatsappReminders) return "WhatsApp is not on this plan";

  if (row.audience === "CUSTOMER") {
    const map = WA_EVENTS[row.event];
    if (!map) return "no WhatsApp message for this event";
    if (!resolvePrefs(business.notificationPrefs).whatsapp[map.pref]) return "turned off by the business";
    const client = row.appointmentId
      ? (await prisma.appointment.findUnique({ where: { id: row.appointmentId }, select: { businessId: true, client: { select: { phone: true, whatsappConsent: true } } } }))
      : null;
    if (!client || client.businessId !== row.businessId) return "booking not found";
    if (!client.client.whatsappConsent) return "no WhatsApp consent";
    if (!digits(client.client.phone) || digits(client.client.phone) !== digits(row.recipient)) return "phone number changed";
    if (await isOptedOut(row.businessId, row.recipient)) return "customer opted out (STOP)";
    return null;
  }

  if (row.audience === "BUSINESS") {
    const p = row.payload as { kind?: PushKind; staffId?: string | null; userId?: string };
    if (!p.kind || !p.userId) return "not an alert";
    const user = await prisma.user.findUnique({
      where: { id: p.userId },
      select: { whatsappPhone: true, whatsappOptIn: true, whatsappVerifiedAt: true, pushPreference: true, teamMember: { select: { businessId: true, permissions: true, staffId: true } } },
    });
    if (!user || !user.whatsappOptIn || !user.whatsappVerifiedAt) return "no WhatsApp opt-in";
    if (digits(user.whatsappPhone) !== digits(row.recipient)) return "number changed";
    const isOwner = business.ownerId === p.userId;
    const m = user.teamMember && user.teamMember.businessId === row.businessId ? user.teamMember : null;
    if (!isOwner && !m) return "not part of this business";
    // Same rules as phone alerts: what the role may see, and what the person wants.
    if (!mayReceive(p.kind, { isOwner, permissions: m ? sanitizePermissions(m.permissions) : [], staffId: m?.staffId ?? null }, p.staffId)) return "no longer allowed";
    if (!wants(p.kind, user.pushPreference as Partial<PushPrefs> | null)) return "switched off by the person";
    return null;
  }
  return "not a WhatsApp audience";
}

/** Send one WHATSAPP outbox row. Never throws for expected failures; the caller maps `retry` / `permanent` / `skipped`. */
export async function sendWhatsAppRow(row: NotificationOutbox, fetcher?: Fetcher): Promise<SendOutcome> {
  const blocked = await whatsappSendBlocker(row);
  if (blocked) return { kind: "skipped", error: blocked };
  const businessId = row.businessId as string;

  const business = await prisma.business.findUnique({ where: { id: businessId }, select: { name: true } });
  const message = buildWhatsAppMessage(row.event, { ...(row.payload as object), businessName: business?.name }, row.audience);
  if (!message) return { kind: "skipped", error: "nothing to say on WhatsApp for this message" };

  const name = templateName(message.key);
  const approved = await prisma.whatsAppTemplate.findMany({ where: { businessId, name, status: "APPROVED" }, select: { language: true } });
  const language = TEMPLATE_LANGUAGES.find((l) => approved.some((t) => t.language === l));
  if (!language) return { kind: "skipped", error: "template not approved yet" };

  const cfg = await prisma.whatsAppConfig.findUnique({ where: { businessId } });
  if (!cfg) return { kind: "skipped", error: "WhatsApp not set up" };
  const r = await sendTemplateMessage(credentialsOf(cfg), digits(row.recipient), { name, language, params: message.params, buttonSuffix: message.buttonSuffix }, fetcher);
  if (r.ok) return { kind: "sent", providerId: r.messageId };

  if (r.authFailure) {
    // The token is dead: pause WhatsApp for this business now rather than waiting for the daily check.
    await prisma.whatsAppConfig.update({ where: { businessId }, data: { status: "ERROR", statusReason: "Meta rejected the access token while sending. Reconnect WhatsApp." } }).catch((err) => logger.error("[WhatsApp] could not pause", { err }));
    return { kind: "skipped", error: "access token rejected: WhatsApp paused" };
  }
  return { kind: isRetryableStatus(r.status) ? "retry" : "permanent", error: r.reason };
}
