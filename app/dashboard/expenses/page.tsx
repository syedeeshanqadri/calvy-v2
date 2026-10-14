import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { ExpensesClient } from "./ExpensesClient";
import { getBusinessFeatures } from "@/lib/getFeatures";
import { UpgradeGate } from "@/components/dashboard/UpgradeGate";

export const dynamic = "force-dynamic";

export default async function ExpensesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.businessId) redirect("/login");

  const features = await getBusinessFeatures(session.user.businessId);
  if (!features.expenseTracking) {
    return (
      <UpgradeGate
        title="Expenses"
        subtitle="Track costs and view profit"
        description="Expense tracking and profit overview are available on the Professional and Business plans."
      />
    );
  }

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const [expenses, monthRevenue] = await Promise.all([
    prisma.expense.findMany({
      where: { businessId: session.user.businessId },
      orderBy: { date: "desc" },
      take: 200,
    }),
    prisma.appointment.aggregate({
      where: {
        businessId: session.user.businessId,
        date: { gte: monthStart, lte: monthEnd },
        status: { not: "cancelled" },
      },
      _sum: { price: true },
    }),
  ]).catch(() => [[], { _sum: { price: null } }] as const);

  const serialized = expenses.map(e => ({
    id: e.id,
    amount: e.amount,
    category: e.category,
    description: e.description,
    date: e.date.toISOString(),
  }));

  return (
    <ExpensesClient
      initialExpenses={serialized}
      monthRevenue={monthRevenue._sum.price ?? 0}
    />
  );
}
