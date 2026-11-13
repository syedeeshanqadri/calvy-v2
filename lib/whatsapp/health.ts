// Daily re-check of every business's WhatsApp connection, run from the existing notifications cron.
// A revoked/expired token (401 / code 190) or a RED quality rating flips the connection to ERROR: sends pause
// (the outbox adapter and email fallback treat a non-CONNECTED config as "email only") and the owner gets ONE email.
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { notify } from "@/lib/notifications/enqueue";
import { alertRecipient } from "@/lib/notifications/business";
import type { Fetcher } from "@/lib/whatsapp/graph";
import { verifyAndStore } from "@/lib/whatsapp/store";

const EVERY_MS = 23 * 3_600_000;
const BATCH = 25;

export async function runWhatsAppHealth(now: Date = new Date(), fetcher?: Fetcher): Promise<number> {
  const due = await prisma.whatsAppConfig.findMany({
    where: { status: { in: ["CONNECTED", "ERROR"] }, OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: new Date(now.getTime() - EVERY_MS) } }] },
    select: { businessId: true },
    take: BATCH,
  });
  let checked = 0;
  for (const { businessId } of due) {
    try {
      const out = await verifyAndStore(businessId, fetcher, { keepOnTransient: true });
      checked++;
      if (!out || out.ok) continue;
      // A passing Meta fault (timeout, 5xx) keeps the status and never pages the owner (verifyAndStore returns ok for it).
      const cfg = await prisma.whatsAppConfig.findUnique({ where: { businessId }, select: { errorNotifiedAt: true, statusReason: true } });
      if (!cfg || cfg.errorNotifiedAt) continue;
      const to = await alertRecipient(businessId);
      if (to) {
        await notify({
          event: "whatsapp.reconnect", audience: "BUSINESS", subjectId: businessId, version: now.toISOString(), recipient: to, template: "form_notification", businessId,
          payload: {
            title: "Action needed: reconnect your WhatsApp",
            fields: {
              What: "Calvy paused WhatsApp messages for your business. Customers still get email.",
              Why: cfg.statusReason ?? "Meta rejected the connection",
              "How to fix": `Open Settings > WhatsApp (${(process.env.NEXT_PUBLIC_APP_URL ?? "https://calvy.io").replace(/\/+$/, "")}/dashboard/settings/whatsapp) and reconnect.`,
            },
            at: now.toISOString(),
          },
        });
      }
      await prisma.whatsAppConfig.update({ where: { businessId }, data: { errorNotifiedAt: now } });
    } catch (err) {
      logger.error("[WhatsApp] health check failed", { err, businessId });
    }
  }
  return checked;
}
