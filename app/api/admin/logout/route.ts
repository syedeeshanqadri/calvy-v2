import { safeRoute } from "@/lib/api";
import { NextResponse } from "next/server";
import { endAdminSession } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

/** End the admin session (and any view-as) now. */
async function POST_handler() {
  await endAdminSession();
  return NextResponse.json({ ok: true });
}

export const POST = safeRoute(POST_handler);
