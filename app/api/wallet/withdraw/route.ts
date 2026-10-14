import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { amount, notes } = await req.json();
  if (!amount || amount <= 0) return NextResponse.json({ error: "Invalid amount" }, { status: 400 });

  const [business, withdrawals, appointments] = await Promise.all([
    prisma.business.findUnique({
      where: { id: session.user.businessId },
      select: { bankAccountName: true, bankIban: true, currency: true },
    }),
    prisma.withdrawalRequest.findMany({
      where: { businessId: session.user.businessId },
    }),
    prisma.appointment.findMany({
      // Exclude payments already paid out directly via Razorpay Route
      where: { businessId: session.user.businessId, paymentMode: "prepaid", paymentStatus: "paid", razorpayTransferId: null },
      select: { price: true },
    }),
  ]);

  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });
  if (!business.bankAccountName && !business.bankIban) {
    return NextResponse.json({ error: "Please add bank account details in Settings > Payout before requesting a withdrawal." }, { status: 400 });
  }

  const currency = business.currency ?? "USD";

  // Balance in business currency
  const totalEarned = appointments.reduce((sum, a) => sum + a.price, 0);
  const totalReleased = withdrawals.filter(w => w.status === "released").reduce((sum, w) => sum + w.amount, 0);
  const walletBalance = Math.max(0, totalEarned - totalReleased);

  if (amount > walletBalance) {
    return NextResponse.json({ error: "Insufficient wallet balance" }, { status: 400 });
  }

  const pending = withdrawals.find(w => w.status === "pending");
  if (pending) {
    return NextResponse.json({ error: "You already have a pending withdrawal request." }, { status: 400 });
  }

  const withdrawal = await prisma.withdrawalRequest.create({
    data: {
      businessId: session.user.businessId,
      amount,
      notes: notes || null,
      status: "pending",
    },
  });

  return NextResponse.json({ withdrawal });
}
