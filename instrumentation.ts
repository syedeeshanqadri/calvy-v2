// Runs once when the Next.js server starts.
export async function register() {
  // Error tracking (server and edge). Disabled unless SENTRY_DSN is set.
  if (process.env.SENTRY_DSN) {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0, sendDefaultPii: false });
  }

  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Appointments are stored as UTC instants and converted in each business's own
  // timezone, so any server timezone is correct. A non-UTC process is still worth a
  // note: logs and any code using server-local Date methods will not read as UTC.
  const serverTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (serverTz !== "UTC" && serverTz !== "Etc/UTC") {
    console.warn(`[time] server timezone is ${serverTz}, not UTC. Bookings are unaffected (stored as UTC), but running with TZ=UTC is recommended.`);
  }

  // One line so it is obvious which mode this server is in (limits and gates apply only when ON).
  const { isPlanEnforcementOn } = await import("@/lib/flags");
  console.warn(`[plans] PLAN_ENFORCEMENT is ${isPlanEnforcementOn() ? "ON: plan limits and feature gates apply" : "OFF: every business has every feature and no limits"}`);

  const { checkEnv, disabledServices, missingStorageEnv, emailSenderWarning } = await import("@/lib/env");
  const { missingRequired } = checkEnv();

  // Names only, never values.
  for (const service of disabledServices()) {
    console.warn(`[env] ${service} disabled (missing configuration)`);
  }

  const senderWarning = emailSenderWarning();
  if (senderWarning) console.warn(senderWarning);

  const missingStorage = missingStorageEnv();
  if (missingStorage.length > 0) {
    console.warn(`[env] uploads will fail: storage driver is s3 but these are missing: ${missingStorage.join(", ")}`);
  }

  if (missingRequired.length > 0 && process.env.NODE_ENV === "production") {
    const msg = `[env] missing required environment variables: ${missingRequired.join(", ")}`;
    console.error(msg);
    throw new Error(msg);
  }
}
