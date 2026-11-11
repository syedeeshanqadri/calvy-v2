"use client";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Bell, X } from "lucide-react";
import { requestPushPermission } from "./PushSetup";

/** One compact line on the Today page only: shown until dismissed or until phone alerts are on for THIS device. */
export function PushBanner() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const onToday = pathname === "/dashboard";

  useEffect(() => {
    if (!onToday) return;
    if (!("Notification" in window) || !("PushManager" in window)) return;
    if (Notification.permission === "denied") return;
    try { if (localStorage.getItem("push-banner-v2-dismissed")) return; } catch { /* private mode: show it */ }
    let live = true;
    (async () => {
      try {
        // Already on for this device: nothing to ask. (Another device of the same person does not count.)
        const reg = await navigator.serviceWorker?.getRegistration("/");
        if (await reg?.pushManager.getSubscription()) return;
        const d = await fetch("/api/push/preferences").then((r) => (r.ok ? r.json() : null));
        if (live && d) setVisible(true);
      } catch { /* stay hidden */ }
    })();
    return () => { live = false; };
  }, [onToday]);

  if (!onToday || !visible) return null;

  function dismiss() {
    try { localStorage.setItem("push-banner-v2-dismissed", "1"); } catch { /* ignore */ }
    setVisible(false);
  }

  async function enable() {
    const r = await requestPushPermission();
    if (r.ok) dismiss();
    else if (r.error) alert(r.error);
  }

  return (
    <div className="mx-4 sm:mx-6 mt-2 flex items-center gap-2 bg-sky-50 border border-sky-200 rounded-xl pl-3 pr-2 py-1.5">
      <Bell size={14} className="text-sky-600 flex-shrink-0" />
      <p className="flex-1 min-w-0 truncate text-xs font-semibold text-sky-800">Turn on phone alerts</p>
      <button onClick={enable} className="flex-shrink-0 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 px-3 py-1.5 rounded-lg transition-colors">
        Enable
      </button>
      <button onClick={dismiss} aria-label="Dismiss" className="flex-shrink-0 p-1.5 text-sky-500 hover:text-sky-700 transition-colors">
        <X size={14} />
      </button>
    </div>
  );
}
