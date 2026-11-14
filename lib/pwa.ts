// Client helpers for the installable business app's service worker. The worker lives at /app-sw.js and controls ONLY /dashboard:
// public and customer pages are never controlled by it, never get the manifest and never show an install prompt.
export const APP_SW_URL = "/app-sw.js";
export const APP_SW_SCOPE = "/dashboard";

export const hasServiceWorker = () => typeof navigator !== "undefined" && "serviceWorker" in navigator;

/** The app worker's registration (works from any page: the scope is looked up by URL). */
export async function getAppRegistration(): Promise<ServiceWorkerRegistration | undefined> {
  if (!hasServiceWorker()) return undefined;
  return navigator.serviceWorker.getRegistration(APP_SW_SCOPE);
}

/**
 * Devices that installed the first worker have a registration with scope "/" (it also controlled public pages). Remove it, and
 * report whether it held a push subscription: unregistering drops that subscription, so the caller re-subscribes under the new
 * worker. The old device row is deleted on the server so it does not linger.
 */
export async function removeLegacyWorkers(): Promise<{ hadPush: boolean }> {
  let hadPush = false;
  if (!hasServiceWorker()) return { hadPush };
  const regs = await navigator.serviceWorker.getRegistrations().catch(() => [] as ServiceWorkerRegistration[]);
  for (const reg of regs) {
    if (new URL(reg.scope).pathname !== "/") continue;
    const sub = await reg.pushManager.getSubscription().catch(() => null);
    if (sub) {
      hadPush = true;
      void fetch("/api/push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
    }
    await reg.unregister().catch(() => {});
  }
  return { hadPush };
}

/** Register the app worker (idempotent). */
export function registerAppWorker(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.register(APP_SW_URL, { scope: APP_SW_SCOPE });
}

// Return the Uint8Array itself (not its .buffer): iOS Safari's pushManager rejects a bare ArrayBuffer as applicationServerKey.
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

const normalize = (s: string) => s.replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const toB64u = (buf: ArrayBuffer) => normalize(btoa(String.fromCharCode(...new Uint8Array(buf))));

/** The application server key this subscription was CREATED with (null when the browser does not expose it). */
export function subscriptionKey(sub: PushSubscription): string | null {
  const k = sub.options?.applicationServerKey;
  return k ? toB64u(k) : null;
}

export type SyncResult = { ok: boolean; code?: "VAPID_MISMATCH"; error?: string };

/** Register this subscription for the signed-in person, with the key it was made with so the server can refuse a mismatch. */
export async function syncSubscriptionDetailed(sub: PushSubscription): Promise<SyncResult> {
  try {
    const json = sub.toJSON();
    const key = subscriptionKey(sub) ?? (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ? normalize(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) : undefined);
    const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys, ...(key ? { applicationServerKey: key } : {}) }) });
    if (res.ok) return { ok: true };
    const d = await res.json().catch(() => ({}));
    return { ok: false, code: d.code, error: d.error };
  } catch {
    return { ok: false };
  }
}
export const syncSubscription = async (sub: PushSubscription): Promise<boolean> => (await syncSubscriptionDetailed(sub)).ok;

/**
 * A subscription for THIS build's key. An existing subscription made with a DIFFERENT key can never receive our pushes (the push
 * service answers 403: VapidPkHashMismatch / BadJwtToken) and the browser refuses to subscribe again with another key while it exists,
 * so a mismatching one is unsubscribed first. `force` always starts clean (used by "Re-enable").
 */
export async function subscribeFresh(reg: ServiceWorkerRegistration, opts: { force?: boolean } = {}): Promise<PushSubscription | null> {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) return null;
  let sub = await reg.pushManager.getSubscription();
  if (sub) {
    const made = subscriptionKey(sub);
    if (opts.force || (made !== null && made !== normalize(key))) { await sub.unsubscribe().catch(() => false); sub = null; }
  }
  return sub ?? reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) as BufferSource });
}

/** Subscribe this device under the app worker and tell the server. Needs permission already granted. */
export async function subscribeAndSync(reg: ServiceWorkerRegistration, opts: { force?: boolean } = {}): Promise<SyncResult> {
  try {
    const sub = await subscribeFresh(reg, opts);
    if (!sub) return { ok: false };
    const r = await syncSubscriptionDetailed(sub);
    if (!r.ok && r.code === "VAPID_MISMATCH") await sub.unsubscribe().catch(() => false); // useless: it would be rejected on every send
    return r;
  } catch {
    return { ok: false };
  }
}

/** Does the server still have this device? False after the push service rejected or dropped it (the server removes it). */
export async function pushRegistered(endpoint: string): Promise<boolean> {
  try {
    const r = await fetch(`/api/push/subscribe?endpoint=${encodeURIComponent(endpoint)}`, { cache: "no-store" });
    return r.ok ? !!(await r.json()).registered : true; // unknown: do not alarm anyone
  } catch { return true; }
}

// ─── Who has phone alerts on, on THIS device ────────────────────────────────────────────────────────────────────────────
// Alerts are turned on per person (reception phones are shared), so the app remembers WHICH person enabled them here. Only that person
// is re-subscribed silently if the browser drops or expires the subscription. Cleared on turn-off and on sign-out.
const PUSH_FLAG = "calvy-push-user";
export function markPushEnabled(userId: string) { try { localStorage.setItem(PUSH_FLAG, userId); } catch { /* private mode */ } }
export function clearPushEnabled() { try { localStorage.removeItem(PUSH_FLAG); } catch { /* ignore */ } }
export function pushEnabledFor(userId: string): boolean { try { return localStorage.getItem(PUSH_FLAG) === userId; } catch { return false; } }

export type EnsureResult = "skipped" | "ok" | "resubscribed" | "needs-reenable" | "failed";

/**
 * On app open: if THIS person turned alerts on here and permission is still granted, check the subscription and repair what can be
 * repaired silently: missing, expired, or made with a different key than this build's -> subscribe again. A subscription that looks
 * fine but that the server no longer has (the push service rejected it) is NOT quietly re-added: it would just be rejected again, so
 * the person is asked to "Re-enable alerts on this device" instead. Never asks for permission.
 */
export async function ensurePushSubscription(userId: string): Promise<EnsureResult> {
  if (!hasServiceWorker() || typeof Notification === "undefined" || Notification.permission !== "granted" || !pushEnabledFor(userId)) return "skipped";
  const reg = await getAppRegistration();
  if (!reg) return "skipped";
  const sub = await reg.pushManager.getSubscription();
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const expired = !!sub && sub.expirationTime != null && sub.expirationTime <= Date.now();
  const made = sub ? subscriptionKey(sub) : null;
  const wrongKey = !!sub && !!key && made !== null && made !== normalize(key);
  if (!sub || expired || wrongKey) return (await subscribeAndSync(reg, { force: wrongKey || expired })).ok ? "resubscribed" : "failed";
  return (await pushRegistered(sub.endpoint)) ? "ok" : "needs-reenable";
}

// ─── Can this device get phone alerts? ──────────────────────────────────────────────────────────────────────────────────
export const isStandalone = () =>
  typeof window !== "undefined" && (window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true);
export const isIos = () => typeof navigator !== "undefined" && (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

/** Why the Enable button cannot work yet. iPhone: web push only exists for an app added to the Home Screen (iOS 16.4+). */
export type PushBlock = "ios-install" | "unsupported" | "denied" | null;
export function pushBlock(): PushBlock {
  if (typeof window === "undefined") return null;
  if (isIos() && !isStandalone()) return "ios-install";
  if (!hasServiceWorker() || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  return null;
}

/** Called when the app is opened or comes to the front: the alerts have been seen, so the icon badge and the lock-screen alerts clear. */
export async function clearSeenAlerts() {
  try {
    const nav = navigator as Navigator & { clearAppBadge?: () => Promise<void> };
    await nav.clearAppBadge?.();
    const reg = await getAppRegistration();
    const shown = (await reg?.getNotifications()) ?? [];
    shown.forEach((n) => n.close());
  } catch { /* badges and notification lists are optional */ }
}
