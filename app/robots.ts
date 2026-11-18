import { SITE_URL } from "@/lib/site";
import type { MetadataRoute } from "next";

const APP_URL = SITE_URL;

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard/", "/admin/", "/api/", "/crm/", "/onboarding", "/account/"],
    },
    sitemap: `${APP_URL}/sitemap.xml`,
  };
}
