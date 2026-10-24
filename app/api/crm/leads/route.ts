import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminSession } from "@/lib/adminAuth";

import { parseQuery } from "@/lib/validation/common";
import { adminPageQuery } from "@/lib/validation/admin";

export const dynamic = "force-dynamic";

async function GET_handler(req: NextRequest) {
  if (!(await isAdminSession())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const q = parseQuery(req.url, adminPageQuery);
  if (!q.ok) return q.res;
  const { page, limit } = q.data;
  const leads = await prisma.lead.findMany({ orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit });
  return NextResponse.json({ leads });
}

export const GET = safeRoute(GET_handler);
