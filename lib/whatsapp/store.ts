// DB side of a business's WhatsApp connection: encrypted credentials, status, templates, opt-outs.
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/notifications/secret";
import { maskSecret } from "@/lib/whatsapp/signature";
import { createTemplate, listTemplates, verifyConnection, type Credentials, type Fetcher } from "@/lib/whatsapp/graph";
import { whatsappCallbackUrl } from "@/lib/whatsapp/urls";
import { TEMPLATE_DEFS, TEMPLATE_LANGUAGES, buildTemplatePayload, currentTemplateNames, templateName, type UrlBases } from "@/lib/whatsapp/templates";

export const newKey = () => randomBytes(24).toString("base64url");

export interface SaveInput { phoneNumberId: string; wabaId: string; accessToken?: string; appSecret?: string }

/** Create or update the credentials. Blank secret fields keep the stored value; any change resets status to PENDING. */
export async function saveConfig(businessId: string, input: SaveInput) {
  const existing = await prisma.whatsAppConfig.findUnique({ where: { businessId } });
  const token = input.accessToken?.trim();
  const secret = input.appSecret?.trim();
  if (!existing && (!token || !secret)) return { ok: false as const, error: "The access token and app secret are required." };
  const data = {
    phoneNumberId: input.phoneNumberId.trim(),
    wabaId: input.wabaId.trim(),
    ...(token ? { accessTokenEnc: encryptSecret(token) } : {}),
    ...(secret ? { appSecretEnc: encryptSecret(secret) } : {}),
    status: "PENDING" as const,
    statusReason: null,
    errorNotifiedAt: null,
  };
  if (existing) await prisma.whatsAppConfig.update({ where: { businessId }, data });
  else {
    await prisma.whatsAppConfig.create({
      data: { businessId, ...data, accessTokenEnc: encryptSecret(token!), appSecretEnc: encryptSecret(secret!), webhookKey: newKey(), verifyTokenEnc: encryptSecret(newKey()) },
    });
  }
  return { ok: true as const };
}

export async function deleteConfig(businessId: string) {
  await prisma.whatsAppConfig.deleteMany({ where: { businessId } });
  await prisma.whatsAppTemplate.deleteMany({ where: { businessId } });
}

type ConfigRow = NonNullable<Awaited<ReturnType<typeof prisma.whatsAppConfig.findUnique>>>;

export const credentialsOf = (c: ConfigRow): Credentials => ({ phoneNumberId: c.phoneNumberId, wabaId: c.wabaId, accessToken: decryptSecret(c.accessTokenEnc) });

/** What the browser may see: masked secrets only. The verify token is shown in full (it is pasted into Meta). */
export function publicView(c: ConfigRow | null) {
  if (!c) return null;
  return {
    phoneNumberId: c.phoneNumberId,
    wabaId: c.wabaId,
    accessTokenMasked: maskSecret(decryptSecret(c.accessTokenEnc)),
    appSecretMasked: maskSecret(decryptSecret(c.appSecretEnc)),
    callbackUrl: whatsappCallbackUrl(c.webhookKey),
    verifyToken: decryptSecret(c.verifyTokenEnc),
    status: c.status,
    statusReason: c.statusReason,
    displayPhone: c.displayPhone,
    verifiedName: c.verifiedName,
    qualityRating: c.qualityRating,
    messagingTier: c.messagingTier,
    lastCheckedAt: c.lastCheckedAt?.toISOString() ?? null,
  };
}

/** Call Meta, store the outcome. `markError` false is for health checks that should not flip status on a Meta hiccup. */
export async function verifyAndStore(businessId: string, fetcher?: Fetcher, opts: { keepOnTransient?: boolean } = {}) {
  const c = await prisma.whatsAppConfig.findUnique({ where: { businessId } });
  if (!c) return null;
  const out = await verifyConnection(credentialsOf(c), fetcher);
  const now = new Date();
  if (out.ok) {
    const bad = out.info.qualityRating === "RED";
    await prisma.whatsAppConfig.update({
      where: { businessId },
      data: { ...out.info, lastCheckedAt: now, status: bad ? "ERROR" : "CONNECTED", statusReason: bad ? "Quality rating is RED: Meta may restrict this number. Sending is paused until it recovers." : null, ...(bad ? {} : { errorNotifiedAt: null }) },
    });
    return { ok: !bad, authFailure: false, transient: false, reason: bad ? "Quality rating is RED" : null };
  }
  if (out.transient && opts.keepOnTransient) {
    // Background check hit a Meta/network hiccup: leave the status alone, look again next time.
    await prisma.whatsAppConfig.update({ where: { businessId }, data: { lastCheckedAt: now } });
    return { ok: true, authFailure: false, transient: true, reason: out.reason };
  }
  await prisma.whatsAppConfig.update({ where: { businessId }, data: { lastCheckedAt: now, status: "ERROR", statusReason: out.reason } });
  return { ok: false, authFailure: out.authFailure, transient: false, reason: out.reason };
}

/** Pull template statuses from Meta into our table. */
export async function refreshTemplates(businessId: string, fetcher?: Fetcher) {
  const c = await prisma.whatsAppConfig.findUnique({ where: { businessId } });
  if (!c) return { ok: false as const, error: "Not connected" };
  const r = await listTemplates(credentialsOf(c), fetcher);
  if (!r.ok) return { ok: false as const, error: r.reason };
  const live = new Set(currentTemplateNames());
  const missing: string[] = [];
  for (const t of r.templates) {
    const res = await prisma.whatsAppTemplate.updateMany({ where: { businessId, name: t.name, language: t.language }, data: { status: t.status.toUpperCase(), reason: t.reason, metaId: t.id } });
    // On Meta and current, but no row here (e.g. created in WhatsApp Manager): add it so the status shows.
    if (res.count === 0 && live.has(t.name)) {
      await prisma.whatsAppTemplate.create({ data: { businessId, name: t.name, language: t.language, status: t.status.toUpperCase(), reason: t.reason, metaId: t.id } });
    }
  }
  const seen = new Set(r.templates.map((t) => `${t.name}/${t.language}`));
  const ours = await prisma.whatsAppTemplate.findMany({ where: { businessId, name: { in: [...live] } }, select: { name: true, language: true, status: true } });
  for (const o of ours) if (!seen.has(`${o.name}/${o.language}`) && o.status !== "NOT_INSTALLED") missing.push(`${o.name} (${o.language})`);
  return { ok: true as const, missing };
}

/** Create every Calvy template on the business's WABA (skipping ones already there), then sync statuses. */
export async function installTemplates(businessId: string, bases: UrlBases, fetcher?: Fetcher) {
  const c = await prisma.whatsAppConfig.findUnique({ where: { businessId } });
  if (!c) return { ok: false as const, error: "Not connected" };
  if (c.status !== "CONNECTED") return { ok: false as const, error: "Verify the connection first." };
  const creds = credentialsOf(c);
  const failures: string[] = [];
  for (const def of TEMPLATE_DEFS) {
    for (const lang of TEMPLATE_LANGUAGES) {
      const name = templateName(def.key);
      const r = await createTemplate(creds, buildTemplatePayload(def, lang, bases), fetcher);
      if (r.ok) {
        await prisma.whatsAppTemplate.upsert({
          where: { businessId_name_language: { businessId, name, language: lang } },
          create: { businessId, name, language: lang, status: r.status, metaId: r.id },
          update: { status: r.status, reason: null, metaId: r.id },
        });
      } else if (r.duplicate) {
        await prisma.whatsAppTemplate.upsert({ where: { businessId_name_language: { businessId, name, language: lang } }, create: { businessId, name, language: lang }, update: {} });
      } else if (r.authFailure) {
        // The token is dead: every remaining call would fail the same way. Stop, pause the connection, write nothing.
        await prisma.whatsAppConfig.update({ where: { businessId }, data: { status: "ERROR", statusReason: "Meta rejected the access token (invalid or expired). Save a new System User token and verify again." } });
        return { ok: false as const, error: "Meta rejected the access token (invalid or expired). Save a new token, press Save and verify, then install again." };
      } else {
        // Could not be CREATED (bad payload, Meta hiccup). NOT_INSTALLED, never REJECTED: Meta did not judge it, and the next Install retries it.
        failures.push(`${name} (${lang}): ${r.reason}`);
        await prisma.whatsAppTemplate.upsert({
          where: { businessId_name_language: { businessId, name, language: lang } },
          create: { businessId, name, language: lang, status: "NOT_INSTALLED", reason: r.reason },
          update: { status: "NOT_INSTALLED", reason: r.reason },
        });
      }
    }
  }
  await refreshTemplates(businessId, fetcher);
  return { ok: true as const, failures };
}

/** Is WhatsApp usable for this business right now (connected)? Sends are paused otherwise. */
export async function isConnected(businessId: string): Promise<boolean> {
  const c = await prisma.whatsAppConfig.findUnique({ where: { businessId }, select: { status: true } });
  return c?.status === "CONNECTED";
}

export const toE164 = (digits: string) => `+${digits.replace(/\D/g, "")}`;

export async function isOptedOut(businessId: string, phone: string): Promise<boolean> {
  return !!(await prisma.whatsAppOptOut.findUnique({ where: { businessId_phone: { businessId, phone: toE164(phone) } }, select: { phone: true } }));
}

/** The templates the Settings page lists: only the names Calvy currently uses (older versions on Meta are ignored). */
export async function listCurrentTemplates(businessId: string) {
  const rows = await prisma.whatsAppTemplate.findMany({
    where: { businessId, name: { in: [...currentTemplateNames()] } },
    orderBy: [{ name: "asc" }, { language: "asc" }],
    select: { name: true, language: true, status: true, reason: true },
  });
  return rows;
}
