import { SITE_URL } from "@/lib/site";

/** calvy.io link with the referring site, so sign-ups can be traced to it (see calvy_ref in components/RefCapture.tsx). Client-safe. */
export function calvyBadgeUrl(slug: string, siteUrl: string = SITE_URL): string {
  return `${siteUrl.replace(/\/+$/, "")}/?ref=${encodeURIComponent(slug)}&utm_source=tenant_site`;
}
