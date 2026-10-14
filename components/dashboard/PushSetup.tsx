"use client";
import { useEffect } from "react";

export function PushSetup() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return;

    async function setup() {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        await navigator.serviceWorker.ready;

        // Only subscribe if permission is already granted — don't auto-prompt
        if (Notification.permission !== "granted") return;

        const existing = await reg.pushManager.getSubscription();
        if (existing) {
          // Always re-sync to ensure DB has the subscription (handles stale JWT refresh)
          await syncSubscription(existing);
          return;
        }

        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!) as BufferSource,
        });
        await syncSubscription(sub);
      } catch {}
    }

    setup();
  }, []);

  return null;
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
