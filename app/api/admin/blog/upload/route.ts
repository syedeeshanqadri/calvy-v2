import { requireAdminApi } from "@/lib/admin/auth";
import { safeRoute } from "@/lib/api";
import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { checkImageUpload, MAX_UPLOAD_BYTES } from "@/lib/validation/upload";
import { logger, getRequestId } from "@/lib/logger";

export const dynamic = "force-dynamic";

// Admin-only cover-image upload. Saves to Vercel Blob under the `blog/` folder.
async function POST_handler(req: NextRequest) {
  const gate = await requireAdminApi();
  if (!gate.ok) return gate.res;
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "Image upload is not available right now." }, { status: 503 });
  }

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_UPLOAD_BYTES + 64 * 1024) {
    return NextResponse.json({ error: "File too large (max 5 MB)" }, { status: 413 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const check = await checkImageUpload(file instanceof File ? file : null);
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

    const pathname = `blog/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${check.ext}`;
    const blob = await put(pathname, file as File, { access: "public", contentType: check.contentType });
    return NextResponse.json({ url: blob.url });
  } catch (err) {
    logger.error("blog upload failed", { err, requestId: getRequestId(req) });
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });
  }
}

export const POST = safeRoute(POST_handler);
