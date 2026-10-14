"use client";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { useCurrency } from "@/components/providers/CurrencyProvider";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { TrendingUp, TrendingDown, Users, Calendar, DollarSign } from "lucide-react";

const COLORS_PIE = ["#0284c7", "#3b82f6", "#22c55e", "#8b5cf6", "#f59e0b"];

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
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={monthlyRevenue}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0ede8" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#6b6b80" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#6b6b80" }} axisLine={false} tickLine={false} tickFormatter={v => `$${Math.round((v as number) / 1000)}k`} width={38} />
                <Tooltip
                  formatter={(v: number, name: string) => [formatPrice(v), name.charAt(0).toUpperCase() + name.slice(1)]}
                  contentStyle={{ borderRadius: 12, border: "1px solid #e8e6e0", boxShadow: "0 8px 24px rgba(0,0,0,0.1)" }}
                />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Line type="monotone" dataKey="revenue" stroke="#0284c7" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="expenses" stroke="#f43f5e" strokeWidth={2} dot={false} activeDot={{ r: 5 }} strokeDasharray="4 2" />
                <Line type="monotone" dataKey="profit" stroke="#22c55e" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid xl:grid-cols-3 gap-6 mb-6">
        <div className="xl:col-span-2">
          <Card>
            <CardHeader><CardTitle>Appointments per day (this week)</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={weeklyAppointments} barCategoryGap="35%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0ede8" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 12, fill: "#6b6b80" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: "#6b6b80" }} axisLine={false} tickLine={false} width={25} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e8e6e0" }} />
                  <Bar dataKey="appointments" fill="#0284c7" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader><CardTitle>Services breakdown</CardTitle></CardHeader>
          <CardContent>
            {serviceDist.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={150}>
                  <PieChart>
                    <Pie data={serviceDist} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3} dataKey="value">
                      {serviceDist.map((_, i) => <Cell key={i} fill={COLORS_PIE[i % COLORS_PIE.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => [`${v}%`, ""]} contentStyle={{ borderRadius: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
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
