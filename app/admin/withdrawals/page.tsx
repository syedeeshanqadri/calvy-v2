import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { getFlags } from "@/lib/flags";
import { CURRENCIES } from "@/lib/currency";
import { WithdrawalsClient } from "./WithdrawalsClient";

export const dynamic = 'force-dynamic';

export default async function AdminWithdrawalsPage() {
  if (!getFlags().wallet) notFound();
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const isAdmin = session.user.role === "admin" || session.user.email === process.env.SUPER_ADMIN_EMAIL;
  if (!isAdmin) redirect("/dashboard");

  const withdrawals = await prisma.withdrawalRequest.findMany({
    include: {
      business: {
        select: {
          name: true,
          currency: true,
          owner: { select: { email: true, name: true } },
          bankAccountName: true,
          bankAccountNumber: true,
          bankRoutingNumber: true,
          bankIban: true,
          appointments: {
            // Exclude payments already paid out directly via Razorpay Route
            where: { paymentMode: "prepaid", paymentStatus: "paid", razorpayTransferId: null },
            select: { price: true },
          },
        },
      },
    },
    orderBy: { requestedAt: "desc" },
  });

  return (
    <WithdrawalsClient
      withdrawals={withdrawals.map(w => {
        const currency = w.business.currency ?? "USD";
        const currencySymbol = CURRENCIES.find(c => c.code === currency)?.symbol ?? currency;
        const allWithdrawals = withdrawals.filter(x => x.businessId === w.businessId);
        const totalEarned = w.business.appointments.reduce((sum, a) => sum + a.price, 0);
        const totalReleased = allWithdrawals.filter(x => x.status === "released").reduce((sum, x) => sum + x.amount, 0);
        const walletBalance = Math.max(0, totalEarned - totalReleased);

        return {
          id: w.id,
          amount: w.amount,
          status: w.status,
          notes: w.notes ?? "",
          adminNotes: w.adminNotes ?? "",
          requestedAt: w.requestedAt.toISOString(),
          processedAt: w.processedAt?.toISOString() ?? null,
          businessName: w.business.name,
          ownerEmail: w.business.owner.email,
          ownerName: w.business.owner.name,
          bankAccountName: w.business.bankAccountName ?? "",
          bankAccountNumber: w.business.bankAccountNumber ?? "",
          bankRoutingNumber: w.business.bankRoutingNumber ?? "",
          bankIban: w.business.bankIban ?? "",
          walletBalance,
          currency,
          currencySymbol,
        };
      })}
    />
  );
}
