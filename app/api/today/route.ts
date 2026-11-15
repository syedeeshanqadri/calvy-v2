import { safeRoute } from "@/lib/api";
import { NextResponse } from "next/server";
import { accessSession } from "@/lib/access";
import { loadToday } from "@/lib/today";

export const dynamic = "force-dynamic";

// The Today list as JSON, scoped to what the signed-in person may see (same rules as the page). Polled by the open app.
async function GET_handler() {
  const session = await accessSession();
  if (!session?.access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await loadToday(session.access), { headers: { "Cache-Control": "no-store" } });
}

export const GET = safeRoute(GET_handler);
