"use client";
import { useEffect } from "react";

// Loads the Sentry browser SDK only when a DSN is configured, so it costs
// nothing (no bundle fetched) in environments without one.
export default function SentryClient() {
  useEffect(() => {
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
    if (!dsn) return;
    import("@sentry/nextjs")
      .then((Sentry) => Sentry.init({ dsn, tracesSampleRate: 0, sendDefaultPii: false }))
      .catch(() => {});
  }, []);
  return null;
}
