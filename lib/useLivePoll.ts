"use client";
import { useEffect, useRef } from "react";

export const REFRESH_EVENT = "calvy:refresh";

/**
 * Lightweight live updates: call `poll` every `ms` while the tab is visible and online, and straight away when the app comes back
 * to the front, the network returns, or pull-to-refresh fires. Hidden tabs do nothing (no battery, no server load).
 */
export function useLivePoll(poll: () => void | Promise<void>, ms = 15_000) {
  const latest = useRef(poll);
  useEffect(() => { latest.current = poll; });
  useEffect(() => {
    const tick = () => { if (document.visibilityState === "visible" && navigator.onLine !== false) void latest.current(); };
    const timer = setInterval(tick, ms);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("online", tick);
    window.addEventListener("focus", tick);
    window.addEventListener(REFRESH_EVENT, tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("online", tick);
      window.removeEventListener("focus", tick);
      window.removeEventListener(REFRESH_EVENT, tick);
    };
  }, [ms]);
}
