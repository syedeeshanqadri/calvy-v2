/** Sends a browser-side error to Sentry when NEXT_PUBLIC_SENTRY_DSN is set; otherwise only logs the digest. */
export function reportClientError(error: Error & { digest?: string }) {
  console.error("App error", error.digest ?? "");
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  import("@sentry/nextjs")
    .then((Sentry) => Sentry.captureException(error))
    .catch(() => {});
}
