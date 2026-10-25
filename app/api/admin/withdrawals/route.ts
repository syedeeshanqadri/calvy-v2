import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin = session.user.kind !== "customer" && (session.user.role === "admin" || session.user.email === process.env.SUPER_ADMIN_EMAIL);
  if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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
