import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { needsReauth, requireAdminApi } from "@/lib/admin/auth";
import { actionSchema, runBusinessAction } from "@/lib/admin/actions";
import { rateLimit } from "@/lib/ratelimit";
import { parseBody } from "@/lib/validation/common";

export const dynamic = "force-dynamic";

/** One admin action on one business (edit, suspend, plan override, resend emails, reset onboarding). Reason + fresh code required; audited. */
async function POST_handler(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminApi();
  if (!gate.ok) return gate.res;
  const re = needsReauth(gate.ctx);
  if (re) return re;
  const rl = await rateLimit(`admin-action:${gate.ctx.user.id}`, 30, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });

  const { id } = await props.params;
  const parsed = await parseBody(req, actionSchema);
  if (!parsed.ok) return parsed.res;
  const r = await runBusinessAction(gate.ctx.user, id.slice(0, 64), parsed.data);
  return r.ok ? NextResponse.json(r) : NextResponse.json({ error: r.error }, { status: r.status });
}

export const POST = safeRoute(POST_handler);
