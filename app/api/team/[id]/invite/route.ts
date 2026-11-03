import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { accessSession } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { issueInvite } from "@/lib/teamDb";
import { appBaseUrl, testTokenHookEnabled } from "@/lib/auth-http";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

async function find(memberId: string, businessId: string) {
  return prisma.teamMember.findFirst({ where: { id: memberId, businessId } });
}

/** Resend: revokes the old link and emails a new one (only while the member has not accepted yet). */
async function POST_handler(req: NextRequest, { params }: Ctx) {
  const s = await accessSession("owner");
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const m = await find((await params).id, s.user.businessId);
  if (!m) return NextResponse.json({ error: "Team member not found." }, { status: 404 });
  if (m.userId) return NextResponse.json({ error: "This member already accepted the invite." }, { status: 409 });
  const token = await issueInvite(m, appBaseUrl(req));
  await audit({ businessId: m.businessId, actorId: s.user.id, action: "team.invite_resent", target: m.email });
  return NextResponse.json({ ok: true, ...(testTokenHookEnabled() && { devToken: token }) });
}

/** Revoke: the open link stops working; the pending member stays listed so the owner can resend or remove. */
async function DELETE_handler(_req: NextRequest, { params }: Ctx) {
  const s = await accessSession("owner");
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const m = await find((await params).id, s.user.businessId);
  if (!m) return NextResponse.json({ error: "Team member not found." }, { status: 404 });
  await prisma.teamInvite.updateMany({ where: { memberId: m.id, usedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
  await audit({ businessId: m.businessId, actorId: s.user.id, action: "team.invite_revoked", target: m.email });
  return NextResponse.json({ ok: true });
}

export const POST = safeRoute(POST_handler);
export const DELETE = safeRoute(DELETE_handler);
