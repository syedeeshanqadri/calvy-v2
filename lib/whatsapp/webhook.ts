// What a verified Meta webhook delivery does for one business (the route has already checked the signature).
import { prisma } from "@/lib/prisma";
import { isStopMessage } from "@/lib/whatsapp/signature";
import { toE164 } from "@/lib/whatsapp/store";

interface Change {
  field?: string;
  value?: {
    metadata?: { phone_number_id?: string };
    statuses?: { id?: string; status?: string; errors?: { code?: number; title?: string; message?: string }[] }[];
    messages?: { from?: string; type?: string; text?: { body?: string } }[];
    event?: string;
    message_template_name?: string;
    message_template_language?: string;
    reason?: string;
    new_category?: string;
  };
}
export interface WebhookPayload { entry?: { changes?: Change[] }[] }

const RANK: Record<string, number> = { sent: 1, delivered: 2, read: 3 };

export async function handleWebhook(businessId: string, phoneNumberId: string, payload: WebhookPayload) {
  const result = { statuses: 0, optOuts: 0, templates: 0 };
  for (const entry of payload.entry ?? []) {
    for (const ch of entry.changes ?? []) {
      const v = ch.value;
      if (!v) continue;

      if (ch.field === "message_template_status_update" && v.message_template_name?.startsWith("calvy_")) {
        const ev = (v.event ?? "").toUpperCase();
        if (ev) {
          const r = await prisma.whatsAppTemplate.updateMany({
            where: { businessId, name: v.message_template_name, ...(v.message_template_language ? { language: v.message_template_language } : {}) },
            data: { status: ev, reason: v.reason && v.reason !== "NONE" ? v.reason : null },
          });
          result.templates += r.count;
        }
        continue;
      }

      // Meta moved a template to another category (typically UTILITY -> MARKETING): remember it, the send gate reads it.
      if ((ch.field === "template_category_update" || ch.field === "message_template_category_update") && v.message_template_name?.startsWith("calvy_") && v.new_category) {
        const r = await prisma.whatsAppTemplate.updateMany({
          where: { businessId, name: v.message_template_name, ...(v.message_template_language ? { language: v.message_template_language } : {}) },
          data: { category: v.new_category.toUpperCase() },
        });
        result.templates += r.count;
        continue;
      }

      // Another number on the same app: not this business's traffic.
      if (v.metadata?.phone_number_id && v.metadata.phone_number_id !== phoneNumberId) continue;

      for (const s of v.statuses ?? []) {
        if (!s.id || !s.status) continue;
        const status = s.status.toLowerCase();
        const row = await prisma.notificationOutbox.findFirst({ where: { businessId, channel: "WHATSAPP", providerId: s.id }, select: { id: true, deliveryStatus: true } });
        if (!row) continue;
        const prev = row.deliveryStatus ? RANK[row.deliveryStatus] ?? 0 : 0;
        if (status !== "failed" && (RANK[status] ?? 0) <= prev) continue; // late "sent" after "read": ignore
        const err = s.errors?.[0];
        await prisma.notificationOutbox.update({
          where: { id: row.id },
          data: { deliveryStatus: status, deliveryError: status === "failed" ? `${err?.code ?? ""} ${err?.title ?? err?.message ?? "delivery failed"}`.trim().slice(0, 300) : null },
        });
        result.statuses++;
      }

      for (const m of v.messages ?? []) {
        if (m.type === "text" && m.from && isStopMessage(m.text?.body)) {
          await prisma.whatsAppOptOut.upsert({
            where: { businessId_phone: { businessId, phone: toE164(m.from) } },
            create: { businessId, phone: toE164(m.from) },
            update: {},
          });
          result.optOuts++;
        }
      }
    }
  }
  return result;
}
