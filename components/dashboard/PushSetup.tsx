"use client";
import { useEffect, useState } from "react";
import { useSession, getSession } from "next-auth/react";
import { clearPushEnabled, clearSeenAlerts, ensurePushSubscription, getAppRegistration, markPushEnabled, registerAppWorker, removeLegacyWorkers, subscribeAndSync } from "@/lib/pwa";

/**
 * Registers the business app's service worker (scope /dashboard only) and shows "New version available" when an update is waiting.
 * Devices that still have the first worker (scope "/") get it removed here; if it held phone alerts they are re-subscribed.
 * It does NOT subscribe to push by itself: phone alerts are turned on per person, on purpose (reception devices are shared).
 */
export function PushSetup() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const userId = useSession().data?.user?.id;

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let cancelled = false;
    let reloading = false;
    const onChange = () => { if (reloading) window.location.reload(); };
    navigator.serviceWorker.addEventListener("controllerchange", onChange);
    (window as unknown as { __calvyReload?: () => void }).__calvyReload = () => { reloading = true; };

    (async () => {
      const { hadPush } = await removeLegacyWorkers();
      const reg = await registerAppWorker();
      if (cancelled) return;
      // The first worker held this person's phone alerts: unregistering it dropped them, so subscribe again under the new one.
      if (hadPush && "Notification" in window && Notification.permission === "granted") await navigator.serviceWorker.ready.then(() => subscribeAndSync(reg));
      void clearSeenAlerts();
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
    })().catch(() => {});
    return () => { cancelled = true; navigator.serviceWorker.removeEventListener("controllerchange", onChange); };
  }, []);

  // Every time the app opens or returns to the front: the alerts have been seen, and this person's subscription is checked (silently re-created if missing or expired).
  useEffect(() => {
    if (!userId) return;
    const open = () => { if (document.visibilityState === "visible") { void clearSeenAlerts(); void ensurePushSubscription(userId); } };
    open();
    document.addEventListener("visibilitychange", open);
    return () => document.removeEventListener("visibilitychange", open);
  }, [userId]);

  if (!waiting) return null;
  return (
    <div role="status" className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-[70] flex items-center gap-3 rounded-xl bg-[#0f0f1a] text-white text-sm px-4 py-3 shadow-xl" data-testid="update-bar">
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

export async function requestPushPermission(opts: { force?: boolean } = {}): Promise<PushResult> {
  const force = !!opts.force;
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
    const reg = await registerAppWorker();
    await navigator.serviceWorker.ready;

    // A subscription made with a different key is replaced (the server would be rejected by the push service for it); `force` = start clean.
    const done = await subscribeAndSync(reg, { force });
    if (!done.ok) return { ok: false, error: done.code === "VAPID_MISMATCH" && done.error ? done.error : "Subscribed on device but the server didn't save it. Check your connection and try again." };
    const me = await getSession();
    if (me?.user?.id) markPushEnabled(me.user.id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `Couldn't subscribe: ${(e as Error).message}` };
  }
}

/** "Re-enable alerts on this device": drop the old subscription completely and make a new one (permission is already granted, so no prompt). */
export async function reenablePush(): Promise<PushResult> {
  return requestPushPermission({ force: true });
}

/** Turn phone alerts off on THIS device (and tell the server). */
export async function disablePush(): Promise<boolean> {
  try {
    const reg = await getAppRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await fetch("/api/push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
      await sub.unsubscribe();
    }
    clearPushEnabled();
    return true;
  } catch {
    return false;
  }
}

/** Before signing out: drop THIS browser's phone-alert device only (other devices of the person keep theirs). Never throws. */
export async function releaseThisDevice(): Promise<void> {
  try {
    if (!("serviceWorker" in navigator)) return;
    const reg = await getAppRegistration();
    const sub = await reg?.pushManager.getSubscription();
    clearPushEnabled(); // signing out: the next person here starts with alerts off
    if (!sub) return; // nothing registered here; never send an "all devices" delete
    await fetch("/api/push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
    await sub.unsubscribe();
  } catch { /* the server-side sign-out event is the fallback */ }
}
