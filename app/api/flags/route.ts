import { safeRoute } from "@/lib/api";
import { NextResponse } from "next/server";
import { getFlags } from "@/lib/flags";

export const dynamic = "force-dynamic";

async function GET_handler() {
  return NextResponse.json(getFlags(), { headers: { "Cache-Control": "no-store" } });
}

export const GET = safeRoute(GET_handler);
