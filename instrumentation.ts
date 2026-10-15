// Runs once when the Next.js server starts (enabled via
// experimental.instrumentationHook in next.config.mjs).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { checkEnv, disabledServices } = await import("@/lib/env");
  const { missingRequired } = checkEnv();

  // Names only, never values.
  for (const service of disabledServices()) {
    console.warn(`[env] ${service} disabled (missing configuration)`);
  }

  if (missingRequired.length > 0 && process.env.NODE_ENV === "production") {
    const msg = `[env] missing required environment variables: ${missingRequired.join(", ")}`;
    console.error(msg);
    throw new Error(msg);
  }
}
