"use client";
import { useEffect, useState, type RefObject } from "react";

export const PULL_THRESHOLD = 64;

/**
 * Pull down at the top of the scroll area to refresh (touch screens only). Returns how far the person has pulled (for the spinner)
 * and whether a refresh is running. `onRefresh` should resolve when the new data is in.
 */
export function usePullToRefresh(ref: RefObject<HTMLElement | null>, onRefresh: () => Promise<void> | void) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || !window.matchMedia("(pointer: coarse)").matches) return;
    let startY = 0, tracking = false, amount = 0, busy = false;
    const start = (e: TouchEvent) => { tracking = !busy && el.scrollTop <= 0 && e.touches.length === 1; startY = e.touches[0].clientY; amount = 0; };
    const move = (e: TouchEvent) => {
      if (!tracking) return;
      const dy = e.touches[0].clientY - startY;
      if (dy <= 0 || el.scrollTop > 0) { amount = 0; setPull(0); return; }
      amount = Math.min(dy * 0.5, PULL_THRESHOLD + 24);
      setPull(amount);
    };
    const end = async () => {
      if (!tracking) return;
      tracking = false;
      const done = amount >= PULL_THRESHOLD;
      setPull(0);
      if (!done) return;
      busy = true; setRefreshing(true);
      try { await onRefresh(); } finally { busy = false; setRefreshing(false); }
    };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: true });
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
    return () => { el.removeEventListener("touchstart", start); el.removeEventListener("touchmove", move); el.removeEventListener("touchend", end); el.removeEventListener("touchcancel", end); };
  }, [ref, onRefresh]);

  return { pull, refreshing };
}
