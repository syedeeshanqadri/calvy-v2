// Connect WhatsApp through Calvy's own Meta app (Embedded Signup). The business token comes from the code
// exchange (server-side, with the app secret), is stored encrypted and never logged. PINs likewise.
import { randomInt } from "crypto";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { encryptSecret } from "@/lib/notifications/secret";
import { graph, type Fetcher } from "@/lib/whatsapp/graph";
import { credentialsOf, installTemplates, newKey, tryDecrypt, verifyAndStore } from "@/lib/whatsapp/store";
import type { UrlBases } from "@/lib/whatsapp/templates";

export interface MetaEnv { appId: string; appSecret: string; configId: string; verifyToken: string }
export function metaEnv(env: Record<string, string | undefined> = process.env): MetaEnv | null {
  const appId = env.META_APP_ID?.trim(), appSecret = env.META_APP_SECRET?.trim(), configId = env.META_ES_CONFIG_ID?.trim();
  if (!appId || !appSecret || !configId) return null;
  return { appId, appSecret, configId, verifyToken: env.META_WEBHOOK_VERIFY_TOKEN?.trim() ?? "" };
}

export interface ConnectInput { code: string; wabaId: string; phoneNumberId: string; coexistence: boolean; pin?: string }
export type ConnectResult =
  | { ok: true; failures: string[] }
  | { ok: false; error: string }
  /** The number already has two-step verification: Calvy cannot register it without the owner's PIN. */
  | { ok: false; needPin: true; wrongPin: boolean };

const genPin = () => String(randomInt(0, 1_000_000)).padStart(6, "0");
/** Meta's "PIN mismatch" family (133005) or any register error that talks about the PIN. */
const isPinError = (r: { error?: { code?: number; message: string } }) => r.error?.code === 133005 || /\bpin\b/i.test(r.error?.message ?? "");

export async function exchangeCode(code: string, env: MetaEnv, fetcher?: Fetcher): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const r = await graph<{ access_token?: string }>("", "oauth/access_token", { query: { client_id: env.appId, client_secret: env.appSecret, code } }, fetcher);
  if (!r.ok || !r.data.access_token) return { ok: false, error: r.error?.message ?? "Meta did not accept the sign-in. Press Connect WhatsApp and try again." };
  return { ok: true, token: r.data.access_token };
}

interface PhoneDetails { status?: string; is_pin_enabled?: boolean; name_status?: string }
const phoneDetails = (token: string, phoneId: string, fetcher?: Fetcher) =>
  graph<PhoneDetails>(token, phoneId, { query: { fields: "status,is_pin_enabled,name_status" } }, fetcher);

/** Payment method on the WABA (Meta bills the business directly). UNKNOWN when Meta will not say; never guessed. */
async function paymentStatus(token: string, wabaId: string, fetcher?: Fetcher): Promise<"OK" | "MISSING" | "UNKNOWN"> {
  const r = await graph<{ primary_funding_id?: string }>(token, wabaId, { query: { fields: "primary_funding_id" } }, fetcher);
  if (!r.ok) return "UNKNOWN";
  return r.data.primary_funding_id ? "OK" : "MISSING";
}

/** Re-read display-name review and payment status from Meta into the row (also called from webhooks). */
export async function refreshEmbeddedInfo(businessId: string, fetcher?: Fetcher) {
  const c = await prisma.whatsAppConfig.findUnique({ where: { businessId } });
  if (!c || c.source !== "EMBEDDED") return;
  let creds; try { creds = credentialsOf(c); } catch { return; }
  await verifyAndStore(businessId, fetcher, { keepOnTransient: true });
  const [phone, pay] = await Promise.all([phoneDetails(creds.accessToken, creds.phoneNumberId, fetcher), paymentStatus(creds.accessToken, creds.wabaId, fetcher)]);
  await prisma.whatsAppConfig.update({ where: { businessId }, data: { paymentStatus: pay, ...(phone.ok && phone.data.name_status ? { nameStatus: phone.data.name_status } : {}) } });
}

async function finish(businessId: string, bases: UrlBases, fetcher?: Fetcher): Promise<ConnectResult> {
  const out = await verifyAndStore(businessId, fetcher);
  if (!out || (!out.ok && out.authFailure)) return { ok: false, error: out?.reason ?? "Could not verify the connection." };
  await refreshEmbeddedInfo(businessId, fetcher);
  const cfg = await prisma.whatsAppConfig.findUnique({ where: { businessId }, select: { status: true, statusReason: true } });
  if (cfg?.status !== "CONNECTED") return { ok: false, error: cfg?.statusReason ?? out.reason ?? "Meta did not confirm the connection." };
  const t = await installTemplates(businessId, bases, fetcher);
  return { ok: true, failures: t.ok ? t.failures : [t.error] };
}

async function register(token: string, phoneId: string, pin: string, fetcher?: Fetcher) {
  return graph(token, `${phoneId}/register`, { method: "POST", body: { messaging_product: "whatsapp", pin } }, fetcher);
}

export async function connectEmbedded(businessId: string, input: ConnectInput, bases: UrlBases, env: MetaEnv, fetcher?: Fetcher): Promise<ConnectResult> {
  const existing = await prisma.whatsAppConfig.findUnique({ where: { businessId }, select: { source: true } });
  if (existing?.source === "MANUAL") return { ok: false, error: "A manual connection is already saved. Disconnect it first, then connect with Calvy." };

  const ex = await exchangeCode(input.code, env, fetcher);
  if (!ex.ok) return ex;
  const base = { phoneNumberId: input.phoneNumberId, wabaId: input.wabaId, accessTokenEnc: encryptSecret(ex.token), coexistence: input.coexistence, source: "EMBEDDED", status: "PENDING" as const, statusReason: null, errorNotifiedAt: null, pinEnc: null, paymentStatus: null, nameStatus: null };
  await prisma.whatsAppConfig.upsert({
    where: { businessId },
    create: { businessId, ...base, appSecretEnc: encryptSecret(""), webhookKey: newKey(), verifyTokenEnc: encryptSecret(newKey()) },
    update: base,
  });

  const sub = await graph(ex.token, `${input.wabaId}/subscribed_apps`, { method: "POST" }, fetcher);
  if (!sub.ok) {
    await prisma.whatsAppConfig.update({ where: { businessId }, data: { status: "ERROR", statusReason: `Could not subscribe Calvy to your WhatsApp account: ${sub.error?.message}` } });
    return { ok: false, error: `Could not subscribe Calvy to your WhatsApp account: ${sub.error?.message}` };
  }

  // A number already in the WhatsApp Business app is registered; registering it again would break coexistence.
  if (!input.coexistence) {
    const d = await phoneDetails(ex.token, input.phoneNumberId, fetcher);
    if (!d.ok) return { ok: false, error: `Could not read your number from Meta: ${d.error?.message}` };
    if (d.data.status !== "CONNECTED") {
      if (d.data.is_pin_enabled && !input.pin) {
        await prisma.whatsAppConfig.update({ where: { businessId }, data: { statusReason: "Enter the two-step verification PIN of this number." } });
        return { ok: false, needPin: true, wrongPin: false };
      }
      const pin = input.pin ?? genPin();
      const reg = await register(ex.token, input.phoneNumberId, pin, fetcher);
      if (!reg.ok) {
        if (isPinError(reg)) return { ok: false, needPin: true, wrongPin: true };
        return { ok: false, error: `Could not register your number: ${reg.error?.message}` };
      }
      await prisma.whatsAppConfig.update({ where: { businessId }, data: { pinEnc: encryptSecret(pin) } });
    }
  }
  return finish(businessId, bases, fetcher);
}

/** Second step when the number has two-step verification: the owner typed the existing PIN. */
export async function finishWithPin(businessId: string, pin: string, bases: UrlBases, fetcher?: Fetcher): Promise<ConnectResult> {
  const c = await prisma.whatsAppConfig.findUnique({ where: { businessId } });
  if (!c || c.source !== "EMBEDDED" || c.status === "CONNECTED") return { ok: false, error: "Nothing is waiting for a PIN. Press Connect WhatsApp." };
  let creds; try { creds = credentialsOf(c); } catch { return { ok: false, error: "Press Connect WhatsApp again." }; }
  const reg = await register(creds.accessToken, c.phoneNumberId, pin, fetcher);
  if (!reg.ok) {
    if (isPinError(reg)) return { ok: false, needPin: true, wrongPin: true };
    return { ok: false, error: `Could not register your number: ${reg.error?.message}` };
  }
  await prisma.whatsAppConfig.update({ where: { businessId }, data: { pinEnc: encryptSecret(pin) } });
  return finish(businessId, bases, fetcher);
}

/** Unsubscribe Calvy's app from the WABA, then delete everything stored (tokens, PIN). Local delete always happens. */
export async function disconnectEmbedded(businessId: string, fetcher?: Fetcher): Promise<{ unsubscribed: boolean }> {
  const c = await prisma.whatsAppConfig.findUnique({ where: { businessId } });
  let unsubscribed = false;
  if (c) {
    const token = tryDecrypt(c.accessTokenEnc);
    if (token) {
      const r = await graph(token, `${c.wabaId}/subscribed_apps`, { method: "DELETE" }, fetcher);
      unsubscribed = r.ok;
      if (!r.ok) logger.warn("[WhatsApp] unsubscribe failed", { businessId, code: r.error?.code });
    }
  }
  await prisma.whatsAppConfig.deleteMany({ where: { businessId } });
  await prisma.whatsAppTemplate.deleteMany({ where: { businessId } });
  return { unsubscribed };
}
