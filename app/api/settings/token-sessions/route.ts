import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { tokenSessionInputSchema } from "@/lib/tokens";
import { saveTokenSession, serializeSession } from "@/lib/tokenSessionsDb";
import { parseBody } from "@/lib/validation/common";

export const dynamic = "force-dynamic";

async function GET_handler() {
  const session = await getServerSession(authOptions);
  const businessId = session?.user?.businessId;
  if (!businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await prisma.tokenSession.findMany({ where: { businessId }, orderBy: [{ startMin: "asc" }, { createdAt: "asc" }] });
  return NextResponse.json({ sessions: rows.map(serializeSession) });
}

async function POST_handler(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const businessId = session?.user?.businessId;
  if (!businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = await parseBody(req, tokenSessionInputSchema);
  if (!parsed.ok) return parsed.res;
  return saveTokenSession(businessId, parsed.data);
}

export const GET = safeRoute(GET_handler);
export const POST = safeRoute(POST_handler);
