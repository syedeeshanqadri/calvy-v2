import { NextRequest, NextResponse } from "next/server";
import { isAdminUser } from "@/lib/adminAuth";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import { parseBody } from "@/lib/validation/common";
import { tenantPatchSchema, tenantDeleteSchema } from "@/lib/validation/admin";
import { logger } from "@/lib/logger";

export const dynamic = 'force-dynamic';

function isAdmin(session: Awaited<ReturnType<typeof getServerSession>> & { user?: { role?: string; email?: string | null } } | null) {
  return isAdminUser(session?.user);
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = await parseBody(req, tenantPatchSchema);
  if (!parsed.ok) return parsed.res;
  const { plan, planStatus, trialEndsAt } = parsed.data;

  const updated = await prisma.business.update({
    where: { id: params.id },
    data: {
      ...(plan !== undefined && { plan }),
      ...(planStatus !== undefined && { planStatus }),
      ...(trialEndsAt !== undefined && { trialEndsAt: trialEndsAt ? new Date(trialEndsAt) : null }),
    },
  });

  return NextResponse.json({ business: updated });
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Destructive: the caller must echo the tenant slug as a confirmation token.
  const parsed = await parseBody(req, tenantDeleteSchema);
  if (!parsed.ok) return parsed.res;
  const tenant = await prisma.business.findUnique({ where: { id: params.id }, select: { id: true, slug: true } });
  if (!tenant) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (parsed.data.confirm !== tenant.slug) {
    return NextResponse.json({ error: "Confirmation does not match the tenant slug." }, { status: 400 });
  }
  logger.warn("admin: tenant deleted", { tenantId: tenant.id, slug: tenant.slug, adminId: session?.user?.id });

  // Delete business (cascades to staff, services, clients, appointments)
  await prisma.business.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
