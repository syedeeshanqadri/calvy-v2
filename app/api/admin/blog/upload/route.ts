import { requireAdminApi } from "@/lib/admin/auth";
import { safeRoute } from "@/lib/api";
import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { checkImageUpload, MAX_UPLOAD_BYTES } from "@/lib/validation/upload";
import { logger, getRequestId } from "@/lib/logger";
import sharp from "sharp";

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

    // Re-encode (strips metadata and anything appended to the file; the bytes served are ones we produced), capped at 2000px wide.
    let webp: Buffer;
    try {
      webp = await sharp(Buffer.from(await (file as File).arrayBuffer()), { limitInputPixels: 40_000_000 })
        .rotate().resize({ width: 2000, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    } catch {
      return NextResponse.json({ error: "We could not read that image." }, { status: 400 });
    }
    const pathname = `blog/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`;
    const blob = await put(pathname, webp, { access: "public", contentType: "image/webp" });
    return NextResponse.json({ url: blob.url });
  } catch (err) {
    logger.error("blog upload failed", { err, requestId: getRequestId(req) });
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });
  }
}

export const POST = safeRoute(POST_handler);
