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
