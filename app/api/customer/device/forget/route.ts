import { safeRoute } from "@/lib/api";
import { NextResponse } from "next/server";
import { clearDeviceCookie } from "@/lib/verifiedDevice";

export const dynamic = "force-dynamic";

/** "Forget this device": clears this browser's remembered-device cookie. It only ever removes the caller's own cookie. */
async function POST_handler() {
  await clearDeviceCookie();
  return NextResponse.json({ ok: true });
}

export const POST = safeRoute(POST_handler);
