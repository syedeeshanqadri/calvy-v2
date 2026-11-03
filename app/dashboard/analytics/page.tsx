import { pageAccess } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { AnalyticsClient } from "./AnalyticsClient";
import { getBusinessFeatures } from "@/lib/getFeatures";
import { UpgradeGate } from "@/components/dashboard/UpgradeGate";

export const dynamic = 'force-dynamic';

const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAY_LABELS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

export default async function AnalyticsPage() {
  const session = await pageAccess("reports.view");

  const businessId = session.user.businessId;

  const features = await getBusinessFeatures(businessId);
  if (!features.analytics) {
    return (
      <UpgradeGate
        title="Analytics"
        subtitle="Revenue charts & KPIs"
        description="Detailed analytics including 12-month revenue trends, service distribution, and top clients are available on the Professional and Business plans."
      />
    );
  }
  const now = new Date();

  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  const [allAppointments, totalClients, topClients, allExpenses] = await Promise.all([
    prisma.appointment.findMany({
      where: { businessId, date: { gte: twelveMonthsAgo }, status: { not: "cancelled" } },
      include: { service: true },
      orderBy: { date: "asc" },
    }),
    prisma.client.count({ where: { businessId } }),
    prisma.client.findMany({
      where: { businessId },
      orderBy: { totalSpent: "desc" },
      take: 5,
      select: { id: true, name: true, totalSpent: true },
    }),
    prisma.expense.findMany({
      where: { businessId, date: { gte: twelveMonthsAgo } },
      select: { amount: true, date: true },
    }),
  ]);

  // Monthly revenue + expenses for past 12 months
  const monthMap: Record<string, { revenue: number; expenses: number }> = {};
  for (let i = 11; i >= 0; i--) {
    const label = MONTH_LABELS[(now.getMonth() - i + 12) % 12];
    monthMap[label] = { revenue: 0, expenses: 0 };
  }
  allAppointments.forEach(a => {
    if (a.paymentStatus !== "paid") return;
    const label = MONTH_LABELS[new Date(a.date).getMonth()];
    if (label in monthMap) monthMap[label].revenue += a.price;
  });
  allExpenses.forEach(e => {
    const label = MONTH_LABELS[new Date(e.date).getMonth()];
    if (label in monthMap) monthMap[label].expenses += e.amount;
  });
  const monthlyRevenue = Object.entries(monthMap).map(([day, { revenue, expenses }]) => ({
    day, revenue, expenses, profit: revenue - expenses,
  }));

  // Weekly appointments (Sun–Sat)
  const weekMap: Record<string, number> = {};
  DAY_LABELS.forEach(d => { weekMap[d] = 0; });
  allAppointments.forEach(a => {
    const d = new Date(a.date);
    if (d >= weekStart && d < weekEnd) {
      const label = DAY_LABELS[d.getDay()];
      weekMap[label] = (weekMap[label] ?? 0) + 1;
    }
  });
  const weeklyAppointments = DAY_LABELS.map(day => ({ day, appointments: weekMap[day] ?? 0 }));

  // Service distribution
  const serviceCounts: Record<string, number> = {};
  allAppointments.forEach(a => {
    serviceCounts[a.service.name] = (serviceCounts[a.service.name] ?? 0) + 1;
  });
  const totalAppts = allAppointments.length || 1;
  const serviceDist = Object.entries(serviceCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, value: Math.round((count / totalAppts) * 100) }));

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  const monthRevenue = allAppointments
    .filter(a => { const d = new Date(a.date); return d >= monthStart && d <= monthEnd && a.paymentStatus === "paid"; })
    .reduce((s, a) => s + a.price, 0);
  const monthExpenses = allExpenses
    .filter(e => { const d = new Date(e.date); return d >= monthStart && d <= monthEnd; })
    .reduce((s, e) => s + e.amount, 0);

  const totalAppointments = allAppointments.length;
  const paidAppointments = allAppointments.filter(a => a.paymentStatus === "paid");
  const avgBookingValue = paidAppointments.length > 0
    ? paidAppointments.reduce((s, a) => s + a.price, 0) / paidAppointments.length
    : 0;

  return (
    <AnalyticsClient
      monthlyRevenue={monthlyRevenue}
      weeklyAppointments={weeklyAppointments}
      serviceDist={serviceDist}
      topClients={topClients}
      totalClients={totalClients}
      totalAppointments={totalAppointments}
      monthRevenue={monthRevenue}
      monthExpenses={monthExpenses}
      avgBookingValue={avgBookingValue}
    />
  );
}
