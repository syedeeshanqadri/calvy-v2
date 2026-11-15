"use client";
import { useEffect, useState } from "react";
import { UndoSlot, type PendingAction } from "@/lib/undoSlot";

/** React wrapper: also sends a pending action when the page is hidden or closed, so it is never lost. */
export function useUndoSlot(windowMs = 5000) {
  const [label, setLabel] = useState<string | null>(null);
  const [slot] = useState(() => new UndoSlot(windowMs, setLabel));
  useEffect(() => {
    const hide = () => { if (document.visibilityState === "hidden") void slot.flush(); };
    const unload = () => { void slot.flush(); };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", unload);
    return () => { document.removeEventListener("visibilitychange", hide); window.removeEventListener("pagehide", unload); void slot.flush(); };
  }, [slot]);
  return { label, schedule: (a: PendingAction) => slot.schedule(a), undo: () => slot.undo(), flush: () => slot.flush() };
}
