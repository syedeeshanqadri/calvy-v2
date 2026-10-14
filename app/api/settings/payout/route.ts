import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const business = await prisma.business.findUnique({
    where: { id: session.user.businessId },
    select: {
      paymentMode: true,
      bankAccountName: true,
      bankAccountNumber: true,
      bankRoutingNumber: true,
      bankIban: true,
      // Razorpay Route KYC
      legalBusinessName: true,
      rzpBusinessType: true,
      rzpCategory: true,
      rzpSubcategory: true,
      panNumber: true,
      gstNumber: true,
      addressStreet: true,
      addressCity: true,
      addressState: true,
      addressPostalCode: true,
      routeStatus: true,
      razorpayConnectAccountId: true,
    },
  });

  return NextResponse.json({ payout: business });
}

export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();

  if (body.paymentMode === "prepaid") {
    const hasBank = body.bankAccountName?.trim() && (body.bankAccountNumber?.trim() || body.bankIban?.trim());
    if (!hasBank) {
      // Check if bank details already exist in DB
      const existing = await prisma.business.findUnique({
        where: { id: session.user.businessId },
        select: { bankAccountName: true, bankAccountNumber: true, bankIban: true },
      });
      const dbHasBank = existing?.bankAccountName?.trim() && (existing?.bankAccountNumber?.trim() || existing?.bankIban?.trim());
      if (!dbHasBank) {
        return NextResponse.json({ error: "Add bank account details before enabling prepaid." }, { status: 400 });
      }
    }
  }

  const allowed = [
    "paymentMode", "bankAccountName", "bankAccountNumber", "bankRoutingNumber", "bankIban",
    "legalBusinessName", "rzpBusinessType", "rzpCategory", "rzpSubcategory",
    "panNumber", "gstNumber", "addressStreet", "addressCity", "addressState", "addressPostalCode",
  ];
  const data: Record<string, string> = {};
  for (const key of allowed) {
    if (body[key] !== undefined) data[key] = body[key];
  }

  const business = await prisma.business.update({
    where: { id: session.user.businessId },
    data,
  });

  return NextResponse.json({ business });
}
