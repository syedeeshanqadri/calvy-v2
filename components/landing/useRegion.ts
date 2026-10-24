"use client";
import { useEffect, useState } from "react";
import { DEFAULT_REGION, type Region } from "@/lib/pricing";
import { regionFromCookieHeader, parseRegion } from "@/lib/region";

/**
 * Pricing region for the visitor. Pages render `initial` on the server (INTL
 * unless the page is India-only); after mount the calvy_region cookie wins,
 * and without one /api/region detects the country and sets it. There is no manual switch.
 * `fixed` pages (/in/pricing) never change region on their own.
 */
export function useRegion(initial: Region = DEFAULT_REGION, fixed = false): Region {
  const [region, setRegionState] = useState<Region>(initial);

  useEffect(() => {
    if (fixed) return;
    // Reading the cookie is the external-system sync this effect exists for.
    const saved = regionFromCookieHeader(document.cookie);
    if (saved) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRegionState(saved);
      return;
    }
    let cancelled = false;
    fetch("/api/region")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const detected = parseRegion(d?.region);
        if (!cancelled && detected) setRegionState(detected);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [fixed]);

  return region;
}
