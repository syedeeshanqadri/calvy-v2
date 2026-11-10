"use client";
import { useEffect, useState } from "react";

/**
 * Registers the service worker for the installed business app and shows "New version available" when an update is waiting.
 * It does NOT subscribe to push by itself: phone alerts are turned on per person, on purpose (reception devices are shared).
 */
export function PushSetup() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let cancelled = false;
    let reloading = false;
    const onChange = () => { if (reloading) window.location.reload(); };
    navigator.serviceWorker.addEventListener("controllerchange", onChange);
    (window as unknown as { __calvyReload?: () => void }).__calvyReload = () => { reloading = true; };

    navigator.serviceWorker.register("/sw.js", { scope: "/" }).then((reg) => {
      if (cancelled) return;
      if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const w = reg.installing;
        w?.addEventListener("statechange", () => {
          if (w.state === "installed" && navigator.serviceWorker.controller) setWaiting(w);
        });
      });
      // Look for a new version whenever the app comes back to the front.
      const check = () => { if (document.visibilityState === "visible") reg.update().catch(() => {}); };
      document.addEventListener("visibilitychange", check);
    }).catch(() => {});
    return () => { cancelled = true; navigator.serviceWorker.removeEventListener("controllerchange", onChange); };
  }, []);

  if (!waiting) return null;
  return (
    <div role="status" className="fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 z-[70] flex items-center gap-3 rounded-xl bg-[#0f0f1a] text-white text-sm px-4 py-3 shadow-xl" data-testid="update-bar">
      <span>New version available</span>
      <button
        type="button"
        className="rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-semibold hover:bg-sky-400"
        onClick={() => { (window as unknown as { __calvyReload?: () => void }).__calvyReload?.(); waiting.postMessage({ type: "SKIP_WAITING" }); }}
      >
        Refresh
      </button>
    </div>
  );
}

export interface PushResult { ok: boolean; error?: string }

export async function requestPushPermission(): Promise<PushResult> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return { ok: false, error: "This device doesn't support web push here. On iPhone, open the app from your Home Screen (installed PWA, iOS 16.4+) — push doesn't work in a Safari tab." };
  }
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
    return { ok: false, error: "Notifications aren't configured on the server (missing key). Try again after the next update." };
  }

  let permission: NotificationPermission;
  try {
    permission = await Notification.requestPermission();
  } catch (e) {
    return { ok: false, error: `Couldn't request permission: ${(e as Error).message}` };
  }
  if (permission !== "granted") {
    return {
      ok: false,
      error: permission === "denied"
        ? "Notifications are blocked. Turn them on in iOS Settings → Notifications → Calvy, then try again."
        : "Permission was dismissed. Tap Enable and choose Allow.",
    };
  }

  try {
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!) as BufferSource,
      });
    }
    const saved = await syncSubscription(sub);
    if (!saved) return { ok: false, error: "Subscribed on device but the server didn't save it. Check your connection and try again." };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `Couldn't subscribe: ${(e as Error).message}` };
  }
}

/** Turn phone alerts off on THIS device (and tell the server). */
export async function disablePush(): Promise<boolean> {
  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await fetch("/api/push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
      await sub.unsubscribe();
    }
    return true;
  } catch {
    return false;
  }
}

async function syncSubscription(sub: PushSubscription): Promise<boolean> {
  try {
    const json = sub.toJSON();
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Return the Uint8Array itself (not its .buffer): iOS Safari's pushManager
// rejects a bare ArrayBuffer as applicationServerKey, which silently fails the
// subscribe on iPhone while Chrome/Android tolerates it.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}
