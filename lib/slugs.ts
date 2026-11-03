/**
 * Slugs that can never belong to a tenant: top-level routes, static files and
 * infrastructure subdomains. Keep in sync with the folders in `app/`
 * (a unit test checks this).
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  // app routes
  "admin", "api", "app", "b", "blog", "booking", "crm", "dashboard", "fonts", "forgot-password", "help",
  "login", "my", "logout", "onboarding", "privacy", "refund-policy", "reset-password", "accept-invite", "signup", "signin",
  "terms", "unsubscribe", "verify-email",
  // static / framework
  "_next", "static", "assets", "public", "favicon", "favicon.ico", "icon", "apple-icon", "robots", "robots.txt",
  "sitemap", "sitemap.xml", "calvy", "offline", "blog-covers", "manifest", "sw", "service-worker",
  // marketing / generic
  "about", "contact", "pricing", "features", "docs", "support", "status", "billing", "settings", "account",
  "in", "careers", "security", "legal", "demo", "home", "index", "null", "undefined",
  // infrastructure subdomains
  "www", "mail", "email", "smtp", "ftp", "cdn", "staging", "dev", "test", "webmail", "ns1", "ns2",
]);

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.trim().toLowerCase());
}

export const SLUG_MIN = 3;
export const SLUG_MAX = 40;

export type SlugCheck = { ok: true; slug: string } | { ok: false; error: string };

/** Pure format check for a tenant slug (the subdomain / URL path). Uniqueness is checked separately and enforced by the DB. */
export function validateSlug(input: string): SlugCheck {
  const slug = input.trim().toLowerCase();
  if (slug.length < SLUG_MIN) return { ok: false, error: `Use at least ${SLUG_MIN} characters.` };
  if (slug.length > SLUG_MAX) return { ok: false, error: `Use at most ${SLUG_MAX} characters.` };
  if (!/^[a-z0-9-]+$/.test(slug)) return { ok: false, error: "Use only lowercase letters, numbers and hyphens." };
  if (slug.startsWith("-") || slug.endsWith("-")) return { ok: false, error: "Do not start or end with a hyphen." };
  if (slug.includes("--")) return { ok: false, error: "Do not use two hyphens in a row." };
  if (isReservedSlug(slug)) return { ok: false, error: "That address is reserved. Please pick another." };
  return { ok: true, slug };
}
