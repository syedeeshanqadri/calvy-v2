"use client";
import { useEffect } from "react";

/**
 * Double-submit guard for every submit button on the site. A second click within 700ms is swallowed, and the button shows its busy state
 * for that moment so the click is seen to register. Components that track their own pending state (Button loading, disabled while saving)
 * keep doing so; this covers the many forms that do not.
 */
export function useSubmitGuard() {
  useEffect(() => {
    const onClick = (ev: MouseEvent) => {
      const b = (ev.target as Element | null)?.closest?.('button[type="submit"], input[type="submit"], button:not([type])') as HTMLButtonElement | null;
      if (!b || b.disabled || !b.form) return;
      const until = Number(b.dataset.guardUntil ?? 0);
      if (Date.now() < until) { ev.preventDefault(); ev.stopImmediatePropagation(); return; }
      b.dataset.guardUntil = String(Date.now() + 700);
      if (b.getAttribute("aria-busy") === null) {
        b.setAttribute("aria-busy", "true");
        window.setTimeout(() => { if (b.dataset.guardUntil) b.removeAttribute("aria-busy"); }, 700);
      }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
}
