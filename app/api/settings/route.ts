import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const business = await prisma.business.findUnique({
    where: { id: session.user.businessId },
    select: {
      id: true, name: true, slug: true, businessType: true,
      phone: true, email: true, address: true, website: true,
      description: true, primaryColor: true, availabilityJson: true, currency: true, slotInterval: true,
    },
  });

  return NextResponse.json({ business });
}

export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const allowed = ["name", "businessType", "phone", "email", "address", "website", "description", "primaryColor", "availabilityJson", "currency", "slotInterval"];
  const data: Record<string, unknown> = {};
  for (const key of allowed) {
    if (body[key] !== undefined) data[key] = key === "slotInterval" ? Number(body[key]) : body[key];
  }

  const business = await prisma.business.update({
    where: { id: session.user.businessId },
    data,
  });

  return NextResponse.json({ business });
}
