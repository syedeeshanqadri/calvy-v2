import { requireAdminApi } from "@/lib/admin/auth";
import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

import { parseQuery } from "@/lib/validation/common";
import { adminTicketListQuery } from "@/lib/validation/admin";

export const dynamic = 'force-dynamic';


async function GET_handler(req: NextRequest) {
  const gate = await requireAdminApi();
  if (!gate.ok) return gate.res;

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
