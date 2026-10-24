"use client";
import { useEffect, useState } from "react";

/**
 * The build-time year is the server-rendered fallback; after hydration the visitor's
 * current year replaces it, so a long-cached page never shows a stale year.
 */
export function CurrentYear({ fallback = 2026 }: { fallback?: number }) {
  const [year, setYear] = useState(fallback);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional post-hydration swap
    setYear(new Date().getFullYear());
  }, []);
  return <span suppressHydrationWarning>{year}</span>;
}
