import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { accessSession } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { parseBody } from "@/lib/validation/common";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const schema = z.object({ active: z.boolean().optional(), showOnSite: z.boolean().optional() });

async function PATCH_handler(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await accessSession("services.manage");
  if (!session?.user?.businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.res;
  // Scoped to this business: another business's offer id matches nothing.
  const r = await prisma.businessOffer.updateMany({ where: { id, businessId: session.user.businessId }, data: parsed.data });
  if (r.count !== 1) return NextResponse.json({ error: "Offer not found." }, { status: 404 });
  await audit({ businessId: session.user.businessId, actorId: session.user.id, action: "offer.updated", target: id, detail: parsed.data });
  return NextResponse.json({ ok: true });
}

async function DELETE_handler(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await accessSession("services.manage");
  if (!session?.user?.businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const r = await prisma.businessOffer.deleteMany({ where: { id, businessId: session.user.businessId } });
  if (r.count !== 1) return NextResponse.json({ error: "Offer not found." }, { status: 404 });
  await audit({ businessId: session.user.businessId, actorId: session.user.id, action: "offer.deleted", target: id });
  return NextResponse.json({ ok: true });
}

export const PATCH = safeRoute(PATCH_handler);
export const DELETE = safeRoute(DELETE_handler);
