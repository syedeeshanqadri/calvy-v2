import { publicSiteUrl } from "@/lib/siteBase";
import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { HELP_ARTICLES } from "@/lib/helpArticles";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://calvy.io";
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "calvy.io";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${APP_URL}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${APP_URL}/pricing`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${APP_URL}/in/pricing`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${APP_URL}/blog`, changeFrequency: "daily", priority: 0.8 },
    { url: `${APP_URL}/help`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${APP_URL}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${APP_URL}/terms`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${APP_URL}/refund-policy`, changeFrequency: "yearly", priority: 0.3 },
  ];

  let posts: { slug: string; updatedAt: Date }[] = [];
  try {
    posts = await prisma.post.findMany({
      where: { published: true },
      select: { slug: true, updatedAt: true },
    });
  } catch {
    // DB unavailable at build — still return static routes
  }

  const postRoutes: MetadataRoute.Sitemap = posts.map(p => ({
    url: `${APP_URL}/blog/${p.slug}`,
    lastModified: p.updatedAt,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  const helpRoutes: MetadataRoute.Sitemap = HELP_ARTICLES.map(a => ({
    url: `${APP_URL}/help/${a.slug}`,
    changeFrequency: "monthly",
    priority: 0.5,
  }));

  // Public booking pages — the SEO acquisition engine. Only businesses that have
  // at least one active service (i.e. a real, set-up page worth indexing).
  let businesses: { slug: string; updatedAt: Date }[] = [];
  try {
    businesses = await prisma.business.findMany({
      where: { services: { some: { isActive: true } } },
      select: { slug: true, updatedAt: true },
    });
  } catch {
    // DB unavailable at build — skip
  }
  const businessRoutes: MetadataRoute.Sitemap = businesses.map(b => ({
    url: publicSiteUrl(b.slug, ROOT_DOMAIN),
    lastModified: b.updatedAt,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  return [...staticRoutes, ...helpRoutes, ...postRoutes, ...businessRoutes];
}
