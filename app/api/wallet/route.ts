import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [withdrawals, prepaidPayments] = await Promise.all([
    prisma.withdrawalRequest.findMany({
      where: { businessId: session.user.businessId },
      orderBy: { requestedAt: "desc" },
    }),
    prisma.appointment.findMany({
      where: {
        businessId: session.user.businessId,
        paymentMode: "prepaid",
        paymentStatus: "paid",
        // Exclude payments already paid out directly via Razorpay Route
        razorpayTransferId: null,
      },
      include: { service: true, client: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  // Balance = paid non-routed appointments − released withdrawals (single source of truth)
  const totalEarned = prepaidPayments.reduce((sum, a) => sum + a.price, 0);
  const totalReleased = withdrawals
    .filter(w => w.status === "released")
    .reduce((sum, w) => sum + w.amount, 0);
  const walletBalance = Math.max(0, totalEarned - totalReleased);

  return NextResponse.json({
    walletBalance,
    withdrawals,
    transactions: prepaidPayments.map(a => ({
      id: a.id,
      type: "credit",
      amount: a.price,
      description: `${a.service.name} - ${a.client.name}`,
      date: a.createdAt,
    })),
  });
}
