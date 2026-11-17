import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/admin/auth";
import { adminAudit } from "@/lib/admin/audit";
import { prisma } from "@/lib/prisma";
import { parseBody } from "@/lib/validation/common";
import { REVIEW_NAME_RE, REVIEW_TEMPLATE_NAME, createReviewTemplate } from "@/lib/whatsapp/reviewTemplate";

export const dynamic = "force-dynamic";

const schema = z.object({ businessId: z.string().trim().min(5).max(64), name: z.string().trim().regex(REVIEW_NAME_RE, "Use lowercase letters, numbers and underscores only.").default(REVIEW_TEMPLATE_NAME) });

/** Super admin only: create the UTILITY review template (name chosen by the admin) on that business's connected WABA and return Meta's id + status. */
async function POST_handler(req: NextRequest) {
  const gate = await requireAdminApi();
  if (!gate.ok) return gate.res;
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.res;
  const result = await createReviewTemplate(parsed.data.businessId, undefined, parsed.data.name);
  await adminAudit(prisma, gate.ctx.user, { action: "whatsapp.review_template", businessId: parsed.data.businessId, detail: result.ok ? { name: parsed.data.name, id: result.id, status: result.status, alreadyExisted: result.alreadyExisted } : { error: result.error } });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}

export const POST = safeRoute(POST_handler);
