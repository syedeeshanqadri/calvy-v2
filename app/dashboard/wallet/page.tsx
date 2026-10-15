import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { getFlags } from "@/lib/flags";
import { CURRENCIES } from "@/lib/currency";
import { WalletClient } from "./WalletClient";
import { getBusinessFeatures } from "@/lib/getFeatures";
import { UpgradeGate } from "@/components/dashboard/UpgradeGate";

export const dynamic = 'force-dynamic';

export default async function WalletPage() {
  if (!getFlags().wallet) notFound();
  const session = await getServerSession(authOptions);
  if (!session?.user?.businessId) redirect("/login");

  const features = await getBusinessFeatures(session.user.businessId);
  if (!features.wallet) {
    return (
      <UpgradeGate
        title="Wallet"
        subtitle="Manage your earnings and withdrawals"
        description="Wallet and withdrawal features are available on the Professional and Business plans."
      />
    );
  }

  const [business, withdrawals, appointments] = await Promise.all([
    prisma.business.findUnique({
      where: { id: session.user.businessId },
      select: {
        currency: true,
        bankAccountName: true,
        bankAccountNumber: true,
        bankIban: true,
      },
    }),
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

  const currency = business?.currency ?? "USD";
  const currencySymbol = CURRENCIES.find(c => c.code === currency)?.symbol ?? currency;

  const transactions = appointments.map(a => ({
    id: a.id,
    amount: a.price,
    description: `${a.service.name} — ${a.client.name}`,
    date: a.createdAt.toISOString(),
  }));

  // Balance = total earned (in business currency) minus released withdrawals
  const totalEarned = transactions.reduce((sum, t) => sum + t.amount, 0);
  const totalReleased = withdrawals
    .filter(w => w.status === "released")
    .reduce((sum, w) => sum + w.amount, 0);
  const walletBalance = Math.max(0, totalEarned - totalReleased);

  return (
    <WalletClient
      walletBalance={walletBalance}
      currencySymbol={currencySymbol}
      hasBankDetails={!!(business?.bankAccountName || business?.bankIban)}
      withdrawals={withdrawals.map(w => ({
        id: w.id,
        amount: w.amount,
        status: w.status,
        notes: w.notes ?? "",
        adminNotes: w.adminNotes ?? "",
        requestedAt: w.requestedAt.toISOString(),
        processedAt: w.processedAt?.toISOString() ?? null,
      }))}
      transactions={transactions}
    />
  );
}
