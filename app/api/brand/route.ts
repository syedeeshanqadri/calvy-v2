import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseBody } from "@/lib/validation/common";
import { rateLimit } from "@/lib/ratelimit";
import { logger, getRequestId } from "@/lib/logger";
import { getStorage } from "@/lib/storage";
import { processLogo } from "@/lib/logo";
import { MAX_LOGO_BYTES } from "@/lib/validation/logo";
import { reviewLinkFromInput, normalizeSocialLinks } from "@/lib/brandLinks";

export const dynamic = "force-dynamic";

async function businessIdOrNull() {
  const session = await getServerSession(authOptions);
  return session?.user?.businessId ?? null;
}

/** Best effort: a leftover file is harmless, a failed cleanup must not fail the request. */
async function removeStored(url: string | null | undefined) {
  if (!url) return;
  try {
    const storage = getStorage();
    const key = storage.keyFromUrl(url);
    if (key) await storage.remove(key);
  } catch (err) {
    logger.warn("logo cleanup failed", { err });
  }
}

/** Upload (replace) the logo. */
async function POST_handler(req: NextRequest) {
  const requestId = getRequestId(req);
  const businessId = await businessIdOrNull();
  if (!businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimit(`logo:${businessId}`, 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many uploads. Please try again shortly." }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });
  }

  // Cheap pre-check before the body is buffered (multipart overhead allowed).
  if (Number(req.headers.get("content-length") ?? 0) > MAX_LOGO_BYTES + 64 * 1024) {
    return NextResponse.json({ error: "Logo is too large (max 2 MB)" }, { status: 413 });
  }

  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    const processed = await processLogo(new Uint8Array(await file.arrayBuffer()));
    if (!processed.ok) return NextResponse.json({ error: processed.error }, { status: 400 });

    const previous = await prisma.business.findUnique({ where: { id: businessId }, select: { logoUrl: true } });
    const key = `logos/${businessId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
    const stored = await getStorage().put(key, processed.png, "image/png");

    await prisma.business.update({ where: { id: businessId }, data: { logoUrl: stored.url } });
    await removeStored(previous?.logoUrl);
    return NextResponse.json({ logoUrl: stored.url });
  } catch (err) {
    logger.error("logo upload failed", { err, requestId });
    const notConfigured = err instanceof Error && err.message === "Object storage is not configured";
    return NextResponse.json(
      { error: notConfigured ? "Logo upload is not available right now." : "Upload failed. Please try again." },
      { status: notConfigured ? 503 : 500 },
    );
  }
}

/** Remove the logo (the site falls back to initials). */
async function DELETE_handler() {
  const businessId = await businessIdOrNull();
  if (!businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const previous = await prisma.business.findUnique({ where: { id: businessId }, select: { logoUrl: true } });
  await prisma.business.update({ where: { id: businessId }, data: { logoUrl: null } });
  await removeStored(previous?.logoUrl);
  return NextResponse.json({ ok: true });
}

const linksSchema = z.object({
  socialLinks: z.record(z.string(), z.string().max(300)).optional(),
  googleReviewUrl: z.string().max(600).optional(),
});

/** Save social links and the Google review link (values are normalised; empty clears). */
async function PATCH_handler(req: NextRequest) {
  const businessId = await businessIdOrNull();
  if (!businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = await parseBody(req, linksSchema);
  if (!parsed.ok) return parsed.res;
  const { socialLinks, googleReviewUrl } = parsed.data;

  const data: { socialLinks?: Record<string, string>; googleReviewUrl?: string | null } = {};
  if (socialLinks !== undefined) {
    const r = normalizeSocialLinks(socialLinks);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    data.socialLinks = r.value;
  }
  if (googleReviewUrl !== undefined) {
    if (!googleReviewUrl.trim()) data.googleReviewUrl = null;
    else {
      const r = reviewLinkFromInput(googleReviewUrl);
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
      data.googleReviewUrl = r.value;
    }
  }

  const updated = await prisma.business.update({
    where: { id: businessId },
    data,
    select: { socialLinks: true, googleReviewUrl: true },
  });
  return NextResponse.json(updated);
}

export const POST = safeRoute(POST_handler);
export const DELETE = safeRoute(DELETE_handler);
export const PATCH = safeRoute(PATCH_handler);
