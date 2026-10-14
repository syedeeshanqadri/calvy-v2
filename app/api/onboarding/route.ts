import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createBusinessForUser } from "@/lib/createBusiness";

export const dynamic = "force-dynamic";

// Completes registration for a logged-in user who has no business yet
// (typically after Google/Facebook sign-in).
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.businessId) {
    return NextResponse.json({ error: "Registration already complete." }, { status: 400 });
  }

  const { businessName, currency } = await req.json();
  if (!businessName?.trim()) {
    return NextResponse.json({ error: "Business name is required." }, { status: 400 });
  }
  if (!currency) {
    return NextResponse.json({ error: "Please select your region." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { business: true },
  });
  if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });
  if (user.business) {
    return NextResponse.json({ error: "Registration already complete." }, { status: 400 });
  }

  await createBusinessForUser({
    ownerId: user.id,
    ownerName: user.name,
    ownerEmail: user.email,
    businessName: businessName.trim(),
    currency,
  });

  return NextResponse.json({ success: true });
}
