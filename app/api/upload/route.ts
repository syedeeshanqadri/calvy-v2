import { put, list } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getBusinessFeatures } from "@/lib/getFeatures";
import {
  checkImageUpload,
  MAX_UPLOAD_BYTES,
  TENANT_UPLOAD_MAX_BYTES,
  TENANT_UPLOAD_MAX_FILES,
} from "@/lib/validation/upload";
import { rateLimit } from "@/lib/ratelimit";
import { logger, getRequestId } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  try {
    const session = await getServerSession(authOptions);
    const businessId = session?.user?.businessId;
    if (!businessId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Plan check in the API, not just the UI.
    const features = await getBusinessFeatures(businessId);
    if (!features.imageUpload) {
      return NextResponse.json({ error: "Image upload is not available on your plan." }, { status: 403 });
    }

    const rl = await rateLimit(`upload:${businessId}`, 10, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Too many uploads. Please try again shortly." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
      );
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json({ error: "Image upload is not available right now." }, { status: 503 });
    }

    // Cheap pre-check before the body is buffered (multipart overhead allowed).
    const declared = Number(req.headers.get("content-length") ?? 0);
    if (declared > MAX_UPLOAD_BYTES + 64 * 1024) {
      return NextResponse.json({ error: "File too large (max 5 MB)" }, { status: 413 });
    }

    const formData = await req.formData();
    const file = formData.get("file");
    const check = await checkImageUpload(file instanceof File ? file : null);
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

    // Per-tenant quota (files and total bytes).
    const prefix = `website/${businessId}/`;
    const existing = await list({ prefix, limit: TENANT_UPLOAD_MAX_FILES + 1 });
    const usedBytes = existing.blobs.reduce((n, b) => n + b.size, 0);
    if (existing.blobs.length >= TENANT_UPLOAD_MAX_FILES || usedBytes + (file as File).size > TENANT_UPLOAD_MAX_BYTES) {
      return NextResponse.json({ error: "Upload limit reached. Delete unused images or contact support." }, { status: 403 });
    }

    const pathname = `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${check.ext}`;
    const blob = await put(pathname, file as File, { access: "public", contentType: check.contentType });

    return NextResponse.json({ url: blob.url });
  } catch (err) {
    logger.error("upload failed", { err, requestId });
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });
  }
}
