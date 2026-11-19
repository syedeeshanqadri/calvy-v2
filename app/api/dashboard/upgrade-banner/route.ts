import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeRoute } from "@/lib/api";

export const dynamic = "force-dynamic";

/** The owner dismisses the "Complete your upgrade" banner. Scoped to their own business. */
async function POST_handler() {
  const session = await getServerSession(authOptions);
  const businessId = session?.user?.businessId;
  if (!businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await prisma.business.update({ where: { id: businessId }, data: { upgradeBannerDismissedAt: new Date() } });
  return NextResponse.json({ success: true });
}

export const POST = safeRoute(POST_handler);
