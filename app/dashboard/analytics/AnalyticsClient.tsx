"use client";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { useCurrency } from "@/components/providers/CurrencyProvider";
import dynamic from "next/dynamic";
import { TrendingUp, TrendingDown, Users, Calendar, DollarSign } from "lucide-react";

const COLORS_PIE = ["#0284c7", "#3b82f6", "#22c55e", "#8b5cf6", "#f59e0b"];

// The charts (recharts) load after the first paint, so the numbers and lists show without waiting for the chart library.
const chartBox = (h: number) => function ChartLoading() { return <div aria-busy="true" aria-label="Loading chart" className="animate-pulse rounded-xl bg-[#f0ede8]" style={{ height: h }} />; };
const RevenueTrend = dynamic(() => import("./AnalyticsCharts").then((m) => m.RevenueTrend), { ssr: false, loading: chartBox(240) });
const WeekBars = dynamic(() => import("./AnalyticsCharts").then((m) => m.WeekBars), { ssr: false, loading: chartBox(180) });
const ServicePie = dynamic(() => import("./AnalyticsCharts").then((m) => m.ServicePie), { ssr: false, loading: chartBox(150) });

interface MonthPoint { day: string; revenue: number; expenses: number; profit: number; }
interface WeekPoint { day: string; appointments: number; }
interface ServiceSlice { name: string; value: number; }
interface TopClient { id: string; name: string; totalSpent: number; }

interface Props {
  monthlyRevenue: MonthPoint[];
  weeklyAppointments: WeekPoint[];
  serviceDist: ServiceSlice[];
  topClients: TopClient[];
  totalClients: number;
  totalAppointments: number;
  monthRevenue: number;
  monthExpenses: number;
  avgBookingValue: number;
}

export function AnalyticsClient({
  monthlyRevenue,
  weeklyAppointments,
  serviceDist,
  topClients,
  totalClients,
  totalAppointments,
  monthRevenue,
  monthExpenses,
  avgBookingValue,
}: Props) {
  const { formatPrice } = useCurrency();
  const maxSpend = topClients[0]?.totalSpent ?? 1;
  const COLORS2 = ["#0284c7", "#3b82f6", "#22c55e", "#8b5cf6", "#f59e0b"];
  const monthProfit = monthRevenue - monthExpenses;

  return (
    <DashboardLayout title="Analytics" subtitle="Your business performance at a glance">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Monthly revenue" value={formatPrice(monthRevenue)} icon={TrendingUp} iconColor="#dcfce7" />
        <StatCard label="Monthly expenses" value={formatPrice(monthExpenses)} icon={TrendingDown} iconColor="#fee2e2" />
        <StatCard label="Monthly profit" value={formatPrice(monthProfit)} icon={DollarSign} iconColor={monthProfit >= 0 ? "#d1fae5" : "#fee2e2"} />
        <StatCard label="Avg. booking value" value={formatPrice(avgBookingValue)} icon={DollarSign} iconColor="#f3e8ff" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-2 gap-4 mb-6">
        <StatCard label="Total clients" value={totalClients} icon={Users} iconColor="#dbeafe" />
        <StatCard label="Total appointments" value={totalAppointments} icon={Calendar} iconColor="#fef3c7" />
      </div>

      {/* Revenue vs Expenses vs Profit chart */}
      <div className="mb-6">
        <Card>
          <CardHeader><CardTitle>Revenue · Expenses · Profit (12 months)</CardTitle></CardHeader>
          <CardContent>
            <RevenueTrend data={monthlyRevenue} formatPrice={formatPrice} />
          </CardContent>
        </Card>
      </div>

      <div className="grid xl:grid-cols-3 gap-6 mb-6">
        <div className="xl:col-span-2">
          <Card>
            <CardHeader><CardTitle>Appointments per day (this week)</CardTitle></CardHeader>
            <CardContent>
              <WeekBars data={weeklyAppointments} />
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader><CardTitle>Services breakdown</CardTitle></CardHeader>
          <CardContent>
            {serviceDist.length > 0 ? (
              <>
                <ServicePie data={serviceDist} />
                <div className="space-y-2 mt-1">
                  {serviceDist.map((s, i) => (
                    <div key={s.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS_PIE[i % COLORS_PIE.length] }} />
                        <span className="text-[#6b6b80]">{s.name}</span>
                      </div>
                      <span className="font-semibold">{s.value}%</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-[#6b6b80] text-center py-8">No data yet</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Top clients by spend</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {topClients.length > 0 ? topClients.map((c, i) => (
            <div key={c.id} className="flex items-center gap-3">
              <span className="text-xs font-bold text-[#6b6b80] w-4">{i + 1}</span>
              <div className="flex-1">
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium">{c.name}</span>
                  <span className="text-[#6b6b80] font-semibold">{formatPrice(c.totalSpent)}</span>
                </div>
                <div className="h-1.5 bg-[#f0ede8] rounded-full">
                  <div className="h-full rounded-full" style={{ width: `${(c.totalSpent / maxSpend) * 100}%`, background: COLORS2[i % COLORS2.length] }} />
                </div>
              </div>
            </div>
          )) : (
            <p className="text-sm text-[#6b6b80] text-center py-6">No client data yet</p>
          )}
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
