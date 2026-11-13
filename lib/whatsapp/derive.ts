// Turns the email notifications about to be queued into WhatsApp rows too (the "every email event" rule), but only
// where a message could ever be sent: the business has WhatsApp set up and the client ticked the consent box.
// Everything else is dropped silently (no noise in the delivery log); the send-time gates in send.ts decide the rest.
import type { Prisma } from "@prisma/client";
import type { NotificationInput } from "@/lib/notifications/enqueue";
import { resolvePrefs } from "@/lib/notifications/prefs";
import { WA_EVENTS, isWhatsAppEvent } from "@/lib/whatsapp/events";

type Db = Pick<Prisma.TransactionClient, "whatsAppConfig" | "appointment" | "business">;
const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

export async function withWhatsApp(db: Db, items: NotificationInput[]): Promise<NotificationInput[]> {
  const isExplicit = (n: NotificationInput) => n.channel === "WHATSAPP";
  const wanted = (n: NotificationInput) =>
    n.audience === "CUSTOMER" && !!n.appointmentId && !!n.businessId && (isExplicit(n) || ((n.channel ?? "EMAIL") === "EMAIL" && isWhatsAppEvent(n.event)));
  const candidates = items.filter(wanted);
  if (!candidates.length) return items.filter((n) => !(isExplicit(n) && n.audience === "CUSTOMER"));

  const businessIds = [...new Set(candidates.map((n) => n.businessId as string))];
  const configs = await db.whatsAppConfig.findMany({ where: { businessId: { in: businessIds } }, select: { businessId: true } });
  const configured = new Set(configs.map((c) => c.businessId));
  const live = candidates.filter((n) => configured.has(n.businessId as string));
  const base = items.filter((n) => !(isExplicit(n) && n.audience === "CUSTOMER")); // explicit WhatsApp rows are re-added below if eligible
  if (!live.length) return base;

  const [appts, businesses] = await Promise.all([
    db.appointment.findMany({ where: { id: { in: [...new Set(live.map((n) => n.appointmentId as string))] } }, select: { id: true, businessId: true, client: { select: { phone: true, whatsappConsent: true } } } }),
    db.business.findMany({ where: { id: { in: [...configured] } }, select: { id: true, notificationPrefs: true } }),
  ]);
  const apptById = new Map(appts.map((a) => [a.id, a]));
  const prefsById = new Map(businesses.map((b) => [b.id, resolvePrefs(b.notificationPrefs)]));

  const out = [...base];
  const seen = new Set<string>();
  for (const n of live) {
    const a = apptById.get(n.appointmentId as string);
    if (!a || a.businessId !== n.businessId || !a.client.whatsappConsent || !digits(a.client.phone)) continue;
    const key = `${n.event}|${n.subjectId}|${n.version ?? ""}|${a.client.phone}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const pref = WA_EVENTS[n.event]?.pref;
    const off = pref && prefsById.get(n.businessId as string)?.whatsapp[pref] === false;
    out.push({ ...n, channel: "WHATSAPP", recipient: a.client.phone as string, ...(off ? { skipReason: "turned off by the business" } : {}) });
  }
  return out;
}
