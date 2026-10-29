/**
 * Where a business's public site is served from, so its links work in both setups:
 * - on its own subdomain (slug.calvy.io) the proxy rewrites "/book-now" to "/slug/book-now", so links are root-relative;
 * - on a plain host (calvy-v2.vercel.app/slug, a preview, localhost) there is no rewrite, so links need the "/slug" prefix.
 * Same host test as proxy.ts.
 */
export function siteBase(host: string | null | undefined, slug: string, rootDomain: string): string {
  const hostname = (host ?? "").replace(/:\d+$/, "").toLowerCase();
  const root = rootDomain.toLowerCase();
  const isSubdomain = hostname !== root && hostname !== `www.${root}` && hostname.endsWith(`.${root}`);
  return isSubdomain ? "" : `/${slug}`;
}

/**
 * Do business sites live on their own subdomain (slug.root)? Only on a real domain with a wildcard DNS
 * record. Hosts that cannot do that (*.vercel.app, localhost, an IP) serve a site by path: root/slug.
 */
export function usesTenantSubdomains(rootDomain: string): boolean {
  const root = rootDomain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, "").toLowerCase();
  if (!root || root === "localhost" || root.endsWith(".localhost") || root.endsWith(".vercel.app") || /^\d{1,3}(\.\d{1,3}){3}$/.test(root)) return false;
  return true;
}

/** The public address of a business's website, right for this deployment: https://slug.calvy.io, or https://host/slug. */
export function publicSiteUrl(slug: string, rootDomain: string): string {
  const root = rootDomain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (usesTenantSubdomains(root)) return `https://${slug}.${root}`;
  const local = /^(localhost|127\.|\d{1,3}(\.\d{1,3}){3})/.test(root);
  return `${local ? "http" : "https"}://${root}/${slug}`;
}
