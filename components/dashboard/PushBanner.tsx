"use client";
import { useState, useEffect } from "react";
import { Bell, X } from "lucide-react";
import { requestPushPermission } from "./PushSetup";

export function PushBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!("Notification" in window) || !("PushManager" in window)) return;
    if (Notification.permission !== "default") return;
    if (localStorage.getItem("push-banner-dismissed")) return;
    setVisible(true);
  }, []);

  if (!visible) return null;

  function dismiss() {
    localStorage.setItem("push-banner-dismissed", "1");
    setVisible(false);
  }

  async function enable() {
    const r = await requestPushPermission();
    if (r.ok) dismiss();
    else if (r.error) alert(r.error);
  }

  return (
    <div className="mx-4 sm:mx-6 mt-3 flex items-center gap-3 bg-sky-50 border border-sky-200 rounded-xl px-4 py-3">
      <Bell size={16} className="text-sky-600 flex-shrink-0" />
      <p className="flex-1 text-xs text-sky-800">
        <span className="font-semibold">Enable push notifications</span> to get instant alerts for new bookings and updates.
      </p>
      <button
        onClick={enable}
        className="flex-shrink-0 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 px-3 py-1.5 rounded-lg transition-colors"
      >
        Enable
      </button>
      <button onClick={dismiss} className="flex-shrink-0 text-sky-500 hover:text-sky-700 transition-colors">
        <X size={14} />
      </button>
    </div>
  );
}
