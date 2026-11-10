import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { needsReauth, requireAdminApi } from "@/lib/admin/auth";
import { createBusinessByAdmin, createBusinessSchema } from "@/lib/admin/actions";
import { rateLimit } from "@/lib/ratelimit";
import { parseBody } from "@/lib/validation/common";

export const dynamic = "force-dynamic";

/** Create a business by hand. Needs a reason and a fresh authenticator code; audited. */
async function POST_handler(req: NextRequest) {
  const gate = await requireAdminApi();
  if (!gate.ok) return gate.res;
  const re = needsReauth(gate.ctx);
  if (re) return re;
  const rl = await rateLimit(`admin-action:${gate.ctx.user.id}`, 30, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });

  const parsed = await parseBody(req, createBusinessSchema);
  if (!parsed.ok) return parsed.res;
  const r = await createBusinessByAdmin(gate.ctx.user, parsed.data);
  return r.ok ? NextResponse.json(r, { status: 201 }) : NextResponse.json({ error: r.error }, { status: r.status });
}

export const POST = safeRoute(POST_handler);
