"use client";
import { useEffect } from "react";

/**
 * First-touch referral: a visitor who arrives from a business's "Bookings by Calvy" link (?ref=<slug>&utm_source=tenant_site)
 * gets a 30-day cookie, which the sign-up route stores on the new account. An existing cookie is never replaced.
 */
export function RefCapture() {
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      const ref = (q.get("ref") ?? "").toLowerCase();
      const source = (q.get("utm_source") ?? "").toLowerCase();
      if (!/^[a-z0-9][a-z0-9-]{0,59}$/.test(ref) || !/^[a-z0-9_]{1,32}$/.test(source)) return;
      if (/(?:^|; )calvy_ref=/.test(document.cookie)) return;
      document.cookie = `calvy_ref=${ref}.${source}; max-age=${30 * 86400}; path=/; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
    } catch { /* cookies blocked: nothing to track */ }
  }, []);
  return null;
}
