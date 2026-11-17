// The ONE Calvy-level webhook (/api/whatsapp/webhook): every Embedded Signup business delivers here. The route has
// already verified the signature on the raw body with Calvy's app secret. Each change is routed to its business by
// phone_number_id (messages, statuses) or the WABA id (entry.id: template, quality and account updates), applied once
// per event, then handed to the same handler the per-business (manual) webhook uses.
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type { Fetcher } from "@/lib/whatsapp/graph";
import { refreshEmbeddedInfo } from "@/lib/whatsapp/embedded";
import { handleWebhook, type WebhookPayload } from "@/lib/whatsapp/webhook";

type Entry = NonNullable<WebhookPayload["entry"]>[number] & { id?: string; time?: number };
type Change = NonNullable<Entry["changes"]>[number];
type Value = NonNullable<Change["value"]> & { message_template_id?: number | string };

const REFRESH_FIELDS = new Set(["phone_number_quality_update", "phone_number_name_update", "account_update", "account_review_update"]);
/** Coexistence fields: acknowledged and reduced to a little sync state. Never routed to the reply / opt-out handler. */
const SYNC_FIELDS = new Set(["history", "smb_app_state_sync", "smb_message_echoes"]);
const PRUNE_AFTER_MS = 7 * 24 * 3_600_000;

const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 40);

/** True the first time a key is seen (the unique primary key decides, so two parallel retries cannot both win). */
export async function claimEvent(key: string): Promise<boolean> {
  try { await prisma.whatsAppWebhookEvent.create({ data: { key } }); return true; } catch (e) {
    if ((e as { code?: string }).code === "P2002") return false;
    throw e;
  }
}

interface SyncValue { history?: { metadata?: { progress?: number } }[] }

/** Minimal state only: when, and how far a history import is. No message text, contact or phone number is kept. */
async function storeSyncState(businessId: string, field: string, v: SyncValue) {
  const now = new Date();
  if (field === "smb_message_echoes") { await prisma.whatsAppConfig.update({ where: { businessId }, data: { lastEchoAt: now } }); return; }
  if (field === "smb_app_state_sync") { await prisma.whatsAppConfig.update({ where: { businessId }, data: { lastStateSyncAt: now } }); return; }
  const p = v.history?.map((h) => h.metadata?.progress).find((x): x is number => typeof x === "number");
  await prisma.whatsAppConfig.update({ where: { businessId }, data: { lastStateSyncAt: now, ...(p !== undefined ? { historyProgress: Math.max(0, Math.min(100, Math.round(p))) } : {}) } });
}

export interface RouteResult { events: number; duplicates: number; unknown: number }

export async function handleCalvyWebhook(payload: WebhookPayload, fetcher?: Fetcher): Promise<RouteResult> {
  const out: RouteResult = { events: 0, duplicates: 0, unknown: 0 };
  for (const entry of ((payload.entry ?? []) as Entry[])) {
    const wabaId = entry.id ? String(entry.id) : "";
    for (const ch of entry.changes ?? []) {
      const v = ch.value as Value | undefined;
      if (!v || !ch.field) continue;
      const phoneId = v.metadata?.phone_number_id;
      const cfg = phoneId
        ? await prisma.whatsAppConfig.findFirst({ where: { phoneNumberId: phoneId, source: "EMBEDDED" }, select: { businessId: true, phoneNumberId: true } })
        : wabaId ? await prisma.whatsAppConfig.findFirst({ where: { wabaId, source: "EMBEDDED" }, select: { businessId: true, phoneNumberId: true } }) : null;
      if (!cfg) {
        // Not (or no longer) connected through Calvy: answer 200 so Meta does not retry it forever.
        logger.warn("[WhatsApp] webhook for an unknown number or account", { field: ch.field, phoneNumberId: phoneId, wabaId });
        out.unknown++;
        continue;
      }

      if (SYNC_FIELDS.has(ch.field)) {
        if (!(await claimEvent(`c:${hash(`${ch.field}:${wabaId}:${entry.time ?? ""}:${JSON.stringify(v)}`)}`))) { out.duplicates++; continue; }
        await storeSyncState(cfg.businessId, ch.field, v as SyncValue);
        out.events++;
        continue;
      }

      if (REFRESH_FIELDS.has(ch.field)) {
        if (await claimEvent(`r:${hash(`${ch.field}:${wabaId}:${entry.time ?? ""}:${JSON.stringify(v)}`)}`)) { await refreshEmbeddedInfo(cfg.businessId, fetcher); out.events++; } else out.duplicates++;
        continue;
      }

      // Keep only what this delivery contains for the first time.
      const fresh: Value = { ...v };
      if (v.statuses) {
        fresh.statuses = [];
        for (const s of v.statuses) {
          if (!s.id || !s.status) continue;
          if (await claimEvent(`s:${s.id}:${s.status}`)) fresh.statuses.push(s); else out.duplicates++;
        }
        if (!fresh.statuses.length && !v.messages) continue;
      }
      if (v.messages) {
        fresh.messages = [];
        for (const m of v.messages as { id?: string; from?: string; type?: string; text?: { body?: string } }[]) {
          const k = m.id ? `m:${m.id}` : `m:${hash(JSON.stringify(m))}`;
          if (await claimEvent(k)) fresh.messages.push(m); else out.duplicates++;
        }
        if (!fresh.messages.length && !fresh.statuses?.length) continue;
      }
      if (!v.statuses && !v.messages) {
        // Template status / category updates carry no event id: the template, what happened and when identify it.
        const k = `t:${ch.field}:${wabaId}:${v.message_template_id ?? v.message_template_name ?? ""}:${v.message_template_language ?? ""}:${v.event ?? v.new_category ?? ""}:${entry.time ?? ""}`;
        if (!(await claimEvent(k))) { out.duplicates++; continue; }
      }
      await handleWebhook(cfg.businessId, cfg.phoneNumberId, { entry: [{ changes: [{ field: ch.field, value: fresh }] }] });
      out.events++;
    }
  }
  if (Math.random() < 0.02) {
    try { await prisma.whatsAppWebhookEvent.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - PRUNE_AFTER_MS) } } }); } catch { /* pruning is best effort */ }
  }
  return out;
}
