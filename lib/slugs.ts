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
