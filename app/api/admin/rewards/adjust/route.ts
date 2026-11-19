import { requireAdminApi, cleanReason } from "@/lib/admin/auth";
import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { parseBody } from "@/lib/validation/common";
import { adminAudit } from "@/lib/admin/audit";
import { LEVELS } from "@/lib/rewards/levels";
import { identityKey } from "@/lib/rewards/rules";
import { adjustLevel } from "@/lib/rewards/levelService";

export const dynamic = "force-dynamic";

/** The audit log never holds contact details: a masked form and a short hash are enough to find the same person again. */
function personRef(identity: string): string {
  const v = identity.slice(2);
  const masked = identity.startsWith("e:") ? `${v[0]}***@${v.split("@")[1] ?? ""}` : `***${v.slice(-3)}`;
  return `${masked} #${createHash("sha256").update(identity).digest("hex").slice(0, 10)}`;
}

const body = z.object({ q: z.string().trim().min(3).max(254), level: z.enum(LEVELS), reason: z.string().max(500) });

/** Set one customer's level by hand (a correction or a goodwill gesture). Audited with who, the person, before and after, and why. */
async function POST_handler(req: NextRequest) {
  const gate = await requireAdminApi();
  if (!gate.ok) return gate.res;
  const parsed = await parseBody(req, body);
  if (!parsed.ok) return parsed.res;
  const reason = cleanReason(parsed.data.reason);
  if (!reason) return NextResponse.json({ error: "Give a reason of at least 8 characters." }, { status: 400 });
  const identity = parsed.data.q.includes("@") ? identityKey({ email: parsed.data.q }) : identityKey({ phone: parsed.data.q });
  if (!identity) return NextResponse.json({ error: "Enter a full email address or phone number." }, { status: 400 });
  const result = await prisma.$transaction(async (tx) => {
    const r = await adjustLevel(tx, identity, parsed.data.level);
    await adminAudit(tx, gate.ctx.user, { action: "rewards.level_adjusted", reason, detail: { person: personRef(identity), before: r.before, after: r.after } });
    return r;
  });
  return NextResponse.json({ ok: true, ...result });
}

export const POST = safeRoute(POST_handler);
