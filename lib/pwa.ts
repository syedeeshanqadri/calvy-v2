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

export async function syncSubscription(sub: PushSubscription): Promise<boolean> {
  try {
    const json = sub.toJSON();
    const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Subscribe this device under the app worker and tell the server. Needs permission already granted. */
export async function subscribeAndSync(reg: ServiceWorkerRegistration): Promise<boolean> {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) return false;
  try {
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) as BufferSource });
    return await syncSubscription(sub);
  } catch {
    return false;
  }
}
