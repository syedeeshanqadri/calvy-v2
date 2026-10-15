import { NextResponse } from "next/server";
import { getFlags } from "@/lib/flags";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getFlags(), { headers: { "Cache-Control": "no-store" } });
}
