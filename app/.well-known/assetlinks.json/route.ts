import { NextResponse } from "next/server";
import { buildAssetLinks } from "@/lib/assetlinks";

export const dynamic = "force-dynamic";

/** Android app link verification (TWA). Empty until TWA_PACKAGE_NAME and TWA_SHA256_FINGERPRINTS are set at Pre-launch. */
export async function GET() {
  return NextResponse.json(buildAssetLinks(), { headers: { "Cache-Control": "public, max-age=3600" } });
}
