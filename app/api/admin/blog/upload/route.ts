import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { checkImageUpload } from "@/lib/validation/upload";
import { isAdminSession } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

// Admin-only cover-image upload. Saves to Vercel Blob under the `blog/` folder.
export async function POST(req: NextRequest) {
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "Image upload not configured. Add BLOB_READ_WRITE_TOKEN to your environment." },
      { status: 503 },
    );
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const check = checkImageUpload(file);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  const pathname = `blog/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${check.ext}`;

  try {
    const blob = await put(pathname, file as File, { access: "public" });
    return NextResponse.json({ url: blob.url });
  } catch (err) {
    console.error("[Blog upload] Error:", err);
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
