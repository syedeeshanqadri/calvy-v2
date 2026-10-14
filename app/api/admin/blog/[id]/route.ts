import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminSession, slugifyTitle, normalizeFaq } from "@/lib/adminAuth";
import { submitToIndexNow } from "@/lib/indexnow";

export const dynamic = "force-dynamic";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://calvy.io";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAdminSession())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const existing = await prisma.post.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const data: Record<string, unknown> = {};

  if (body.title !== undefined) data.title = String(body.title).trim();
  if (body.content !== undefined) data.content = body.content;
  if (body.excerpt !== undefined) data.excerpt = body.excerpt?.trim() || null;
  if (body.coverImage !== undefined) data.coverImage = body.coverImage?.trim() || null;
  if (body.authorName !== undefined) data.authorName = body.authorName?.trim() || "Calvy Team";
  if (body.tags !== undefined) data.tags = typeof body.tags === "string" ? body.tags.trim() : "";
  if (body.seoTitle !== undefined) data.seoTitle = body.seoTitle?.trim() || null;
  if (body.seoDescription !== undefined) data.seoDescription = body.seoDescription?.trim() || null;
  if (body.faq !== undefined) data.faq = normalizeFaq(body.faq);

  // Slug change (validate uniqueness)
  if (body.slug !== undefined && body.slug.trim()) {
    const newSlug = slugifyTitle(body.slug);
    if (newSlug !== existing.slug) {
      const taken = await prisma.post.findUnique({ where: { slug: newSlug } });
      if (taken) return NextResponse.json({ error: "That slug is already in use." }, { status: 409 });
      data.slug = newSlug;
    }
  }

  // Publish toggle — stamp publishedAt the first time it goes live
  if (body.published !== undefined) {
    data.published = !!body.published;
    if (body.published && !existing.publishedAt) data.publishedAt = new Date();
    if (!body.published) data.publishedAt = null;
  }

  const post = await prisma.post.update({ where: { id: params.id }, data });

  if (post.published) {
    submitToIndexNow([`${APP_URL}/blog/${post.slug}`, `${APP_URL}/blog`]).catch(() => {});
  }

  return NextResponse.json({ post });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAdminSession())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await prisma.post.delete({ where: { id: params.id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
