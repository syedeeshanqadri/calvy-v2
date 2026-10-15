import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminSession, slugifyTitle, normalizeFaq } from "@/lib/adminAuth";
import { submitToIndexNow } from "@/lib/indexnow";

import { parseBody, parseQuery } from "@/lib/validation/common";
import { adminPageQuery, postCreateSchema } from "@/lib/validation/admin";

export const dynamic = "force-dynamic";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://calvy.io";

async function uniqueSlug(base: string): Promise<string> {
  let slug = base;
  for (let i = 2; i <= 99; i++) {
    const exists = await prisma.post.findUnique({ where: { slug } });
    if (!exists) return slug;
    slug = `${base}-${i}`;
  }
  return `${base}-${Date.now()}`;
}

// List all posts (admin)
export async function GET(req: NextRequest) {
  if (!(await isAdminSession())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const q = parseQuery(req.url, adminPageQuery);
  if (!q.ok) return q.res;
  const { page, limit } = q.data;
  const posts = await prisma.post.findMany({ orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit });
  return NextResponse.json({ posts });
}

// Create a post
export async function POST(req: NextRequest) {
  if (!(await isAdminSession())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = await parseBody(req, postCreateSchema);
  if (!parsed.ok) return parsed.res;
  const body = parsed.data;
  const { title, content } = body;

  const slug = await uniqueSlug(body.slug?.trim() ? slugifyTitle(body.slug) : slugifyTitle(title));
  const published = !!body.published;

  const post = await prisma.post.create({
    data: {
      title: title.trim(),
      slug,
      excerpt: body.excerpt?.trim() || null,
      content,
      coverImage: body.coverImage?.trim() || null,
      authorName: body.authorName?.trim() || "Calvy Team",
      tags: typeof body.tags === "string" ? body.tags.trim() : "",
      seoTitle: body.seoTitle?.trim() || null,
      seoDescription: body.seoDescription?.trim() || null,
      faq: normalizeFaq(body.faq),
      published,
      publishedAt: published ? new Date() : null,
    },
  });

  if (post.published) {
    submitToIndexNow([`${APP_URL}/blog/${post.slug}`, `${APP_URL}/blog`]).catch(() => {});
  }

  return NextResponse.json({ post }, { status: 201 });
}
