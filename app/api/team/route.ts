import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { accessSession } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { checkLimit, denialResponse } from "@/lib/limits";
import { PERMISSIONS, sanitizePermissions } from "@/lib/permissions";
import { emailField, id, parseBody, text } from "@/lib/validation/common";
import { audit } from "@/lib/audit";
import { issueInvite, serializeMember } from "@/lib/teamDb";
import { appBaseUrl, testTokenHookEnabled } from "@/lib/auth-http";

export const dynamic = "force-dynamic";

const memberCreateSchema = z.object({
  name: text(80).min(1),
  email: emailField,
  roleName: text(40).min(1),
  permissions: z.array(z.enum(PERMISSIONS)).max(PERMISSIONS.length),
  staffId: id.nullish(),
});

async function GET_handler() {
  const s = await accessSession("owner");
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await prisma.teamMember.findMany({ where: { businessId: s.user.businessId }, orderBy: { createdAt: "asc" } });
  return NextResponse.json({ members: rows.map(serializeMember) });
}

async function POST_handler(req: NextRequest) {
  const s = await accessSession("owner");
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const businessId = s.user.businessId;

  const parsed = await parseBody(req, memberCreateSchema);
  if (!parsed.ok) return parsed.res;
  const { name, email, roleName, permissions, staffId } = parsed.data;

  const denied = await checkLimit(businessId, "team", { owner: true });
  if (denied) return denialResponse(denied);

  if (staffId && !(await prisma.staff.findFirst({ where: { id: staffId, businessId }, select: { id: true } }))) {
    return NextResponse.json({ error: "That staff record was not found." }, { status: 404 });
  }
  // One login = one business: the email must not already be a Calvy login or a pending invite.
  const taken =
    (await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true } })) ||
    (await prisma.teamMember.findUnique({ where: { email }, select: { id: true } }));
  if (taken) return NextResponse.json({ error: "That email already has a Calvy login. Use a different email." }, { status: 409 });

  const member = await prisma.teamMember.create({
    data: { businessId, email, name, roleName, permissions: sanitizePermissions(permissions), staffId: staffId ?? null },
  });
  const token = await issueInvite(member, appBaseUrl(req));
  await audit({ businessId, actorId: s.user.id, action: "team.member_added", target: email, detail: { roleName, permissions: member.permissions } });
  return NextResponse.json({ member: serializeMember(member), ...(testTokenHookEnabled() && { devToken: token }) }, { status: 201 });
}

export const GET = safeRoute(GET_handler);
export const POST = safeRoute(POST_handler);
