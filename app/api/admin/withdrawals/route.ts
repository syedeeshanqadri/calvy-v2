import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function GET() {
  const gate = await requireAdminApi();
  if (!gate.ok) return gate.res;

  const withdrawals = await prisma.withdrawalRequest.findMany({
    include: {
      business: {
        select: {
          name: true,
          owner: { select: { email: true, name: true } },
          bankAccountName: true,
          bankAccountNumber: true,
          bankRoutingNumber: true,
          bankIban: true,
        },
      },
    },
    orderBy: { requestedAt: "desc" },
  });

  return NextResponse.json({ withdrawals });
}
