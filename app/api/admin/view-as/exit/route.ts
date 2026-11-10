import { safeRoute } from "@/lib/api";
import { NextResponse } from "next/server";
import { closeViewAs, requireAdminApi } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

/** One-click exit. Always allowed, also while a read-only view-as is active. */
async function POST_handler() {
  const gate = await requireAdminApi();
  if (!gate.ok) return gate.res;
  const ended = await closeViewAs(gate.ctx.sessionId, gate.ctx.user, "exit");
  return NextResponse.json({ ok: true, ended });
}

export const POST = safeRoute(POST_handler);
