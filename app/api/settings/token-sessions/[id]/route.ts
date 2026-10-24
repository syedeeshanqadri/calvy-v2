import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { tokenSessionInputSchema } from "@/lib/tokens";
import { saveTokenSession } from "@/lib/tokenSessionsDb";
import { parseBody } from "@/lib/validation/common";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function PUT_handler(req: NextRequest, ctx: Ctx) {
  const session = await getServerSession(authOptions);
  const businessId = session?.user?.businessId;
  if (!businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const parsed = await parseBody(req, tokenSessionInputSchema);
  if (!parsed.ok) return parsed.res;
  return saveTokenSession(businessId, parsed.data, id);
}

async function DELETE_handler(_req: NextRequest, ctx: Ctx) {
  const session = await getServerSession(authOptions);
  const businessId = session?.user?.businessId;
  if (!businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const { count } = await prisma.tokenSession.deleteMany({ where: { id, businessId } });
  if (!count) return NextResponse.json({ error: "Session not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export const PUT = safeRoute(PUT_handler);
export const DELETE = safeRoute(DELETE_handler);
