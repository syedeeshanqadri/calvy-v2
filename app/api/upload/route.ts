import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkImageUpload } from "@/lib/validation/upload";
import { rateLimit } from "@/lib/ratelimit";
import { logger } from "@/lib/logger";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.businessId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = await rateLimit(`upload:${session.user.businessId}`, 10, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Too many uploads. Please try again shortly." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
      );
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        { error: "Image upload not configured. Add BLOB_READ_WRITE_TOKEN to your environment." },
        { status: 503 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const check = checkImageUpload(file);
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

    const pathname = `website/${session.user.businessId}/${Date.now()}.${check.ext}`;
    const blob = await put(pathname, file as File, { access: "public" });

    return NextResponse.json({ url: blob.url });
  } catch (err) {
    logger.error("[Upload] Error:", { err });
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
