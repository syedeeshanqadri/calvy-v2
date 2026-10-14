"use client";
import { StatCard } from "@/components/ui/StatCard";
import { useCurrency } from "@/components/providers/CurrencyProvider";
import { Calendar, DollarSign, UserPlus, TrendingUp, TrendingDown, Clock, Users } from "lucide-react";

interface Props {
  todayApptsCount: number;
  todayRevenue: number;
  newClientsThisWeek: number;
  showUpRate: number;
  monthRevenue: number;
  monthExpenses: number;
  totalClients: number;
  pendingCount: number;
  completedToday: number;
}

export function DashboardKPIStats({
  todayApptsCount,
  todayRevenue,
  newClientsThisWeek,
  showUpRate,
  monthRevenue,
  monthExpenses,
  totalClients,
  pendingCount,
  completedToday,
}: Props) {
  const { formatPrice } = useCurrency();
  const monthProfit = monthRevenue - monthExpenses;

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Today's appointments" value={todayApptsCount} icon={Calendar} iconColor="#fef3c7" />
        <StatCard label="Today's revenue" value={formatPrice(todayRevenue)} icon={DollarSign} iconColor="#dcfce7" />
        <StatCard label="New clients this week" value={newClientsThisWeek} icon={UserPlus} iconColor="#dbeafe" />
        <StatCard label="Show-up rate" value={`${showUpRate}%`} icon={TrendingUp} iconColor="#f3e8ff" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Monthly revenue" value={formatPrice(monthRevenue)} icon={TrendingUp} iconColor="#dcfce7" />
        <StatCard label="Monthly expenses" value={formatPrice(monthExpenses)} icon={TrendingDown} iconColor="#fee2e2" />
        <StatCard
          label="Monthly profit"
          value={formatPrice(monthProfit)}
          icon={DollarSign}
          iconColor={monthProfit >= 0 ? "#d1fae5" : "#fee2e2"}
        />
        <StatCard label="Total clients" value={totalClients} icon={Users} iconColor="#dbeafe" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Pending approvals" value={pendingCount} changeType="neutral" icon={Clock} iconColor="#fff7ed" />
        <StatCard label="Completed today" value={completedToday} icon={Calendar} iconColor="#f0fdf4" />
      </div>
    </>
  );
}
