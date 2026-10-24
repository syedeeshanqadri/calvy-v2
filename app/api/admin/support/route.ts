import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { isAdminUser } from "@/lib/adminAuth";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import { parseQuery } from "@/lib/validation/common";
import { adminTicketListQuery } from "@/lib/validation/admin";

export const dynamic = 'force-dynamic';

function isAdmin(session: Awaited<ReturnType<typeof getServerSession>> & { user?: { role?: string; email?: string | null } } | null) {
  return isAdminUser(session?.user);
}

async function GET_handler(req: NextRequest) {
  const session = await getServerSession(authOptions) as Awaited<ReturnType<typeof getServerSession>> & { user?: { role?: string; email?: string | null } } | null;
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const q = parseQuery(req.url, adminTicketListQuery);
  if (!q.ok) return q.res;
  const { status, page, limit } = q.data;

  const tickets = await prisma.supportTicket.findMany({
    where: status ? { status } : undefined,
    orderBy: { updatedAt: "desc" },
    skip: (page - 1) * limit,
    take: limit,
    include: {
      business: {
        select: {
          name: true,
          owner: { select: { email: true, name: true } },
        },
      },
      _count: { select: { messages: true } },
    },
  });

  return NextResponse.json(tickets);
}

export const GET = safeRoute(GET_handler);
