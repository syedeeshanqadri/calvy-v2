import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLimitsFromDB } from "@/lib/plans";

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(authOptions);
  const businessId = (session?.user as { businessId?: string } | undefined)?.businessId;
  if (!session?.user || !businessId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { plan: true },
  });

  if (!business) {
    return NextResponse.json({ error: "Business not found" }, { status: 404 });
  }

  const limits = await getLimitsFromDB(business.plan);

  return NextResponse.json({ limits, plan: business.plan });
}
