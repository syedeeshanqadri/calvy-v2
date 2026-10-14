import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Building2, Users, TrendingUp, CreditCard, Crown, Clock, AlertTriangle, Activity } from "lucide-react";
import Link from "next/link";

export const dynamic = 'force-dynamic';

export default async function AdminOverviewPage() {
  const session = await getServerSession(authOptions);
  const isAdmin = session?.user?.role === "admin" || session?.user?.email === process.env.SUPER_ADMIN_EMAIL;
  if (!isAdmin) redirect("/login");

  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const [
    totalBusinesses,
    activeBusinesses,
    trialBusinesses,
    pastDueBusinesses,
    totalAppointments,
    monthAppointments,
    todayAppointments,
    totalClients,
    monthRevenue,
    recentTenants,
    planDist,
  ] = await Promise.all([
    prisma.business.count(),
    prisma.business.count({ where: { planStatus: "active" } }),
    prisma.business.count({ where: { plan: "trial" } }),
    prisma.business.count({ where: { planStatus: "past_due" } }),
    prisma.appointment.count(),
    prisma.appointment.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.appointment.count({ where: { date: { gte: today } } }),
    prisma.client.count(),
    prisma.appointment.aggregate({ where: { createdAt: { gte: monthStart }, paymentStatus: "paid" }, _sum: { price: true } }),
    prisma.business.findMany({ take: 5, orderBy: { createdAt: "desc" }, include: { owner: { select: { email: true } } } }),
    prisma.business.groupBy({ by: ["plan"], _count: { id: true } }),
  ]);

  const PLAN_COLORS: Record<string, string> = {
    trial: "bg-gray-200", starter: "bg-blue-400", professional: "bg-sky-500", business: "bg-amber-500",
  };

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="font-syne font-bold text-2xl">Overview</h1>
        <p className="text-[#6b6b80] mt-1 text-sm">Platform-wide stats and activity</p>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Tenants", value: totalBusinesses, icon: Building2, color: "bg-blue-50 text-blue-600", sub: `${activeBusinesses} active` },
          { label: "Total Clients", value: totalClients, icon: Users, color: "bg-green-50 text-green-600", sub: "across all tenants" },
          { label: "Month Revenue", value: `$${(monthRevenue._sum.price ?? 0).toFixed(0)}`, icon: TrendingUp, color: "bg-sky-50 text-sky-600", sub: `${monthAppointments} bookings` },
          { label: "Total Appointments", value: totalAppointments, icon: Activity, color: "bg-accent/10 text-accent", sub: `${todayAppointments} today` },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-2xl border border-[#e8e6e0] p-5">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${s.color}`}>
              <s.icon size={18} />
            </div>
            <p className="font-syne font-bold text-2xl">{s.value}</p>
            <p className="text-sm font-medium mt-0.5">{s.label}</p>
            <p className="text-xs text-[#6b6b80] mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Plan distribution */}
        <div className="bg-white rounded-2xl border border-[#e8e6e0] p-6">
          <h2 className="font-syne font-semibold text-[15px] mb-4">Plan Distribution</h2>
          <div className="space-y-3">
            {planDist.map((p) => {
              const pct = totalBusinesses > 0 ? Math.round((p._count.id / totalBusinesses) * 100) : 0;
              return (
                <div key={p.plan}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="capitalize font-medium">{p.plan}</span>
                    <span className="text-[#6b6b80]">{p._count.id} ({pct}%)</span>
                  </div>
                  <div className="h-2 bg-[#f0ede8] rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${PLAN_COLORS[p.plan] ?? "bg-gray-300"}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Status overview */}
        <div className="bg-white rounded-2xl border border-[#e8e6e0] p-6">
          <h2 className="font-syne font-semibold text-[15px] mb-4">Subscription Health</h2>
          <div className="space-y-3">
            {[
              { label: "Active subscriptions", value: activeBusinesses, icon: Crown, color: "text-green-600 bg-green-50" },
              { label: "On free trial", value: trialBusinesses, icon: Clock, color: "text-amber-600 bg-amber-50" },
              { label: "Past due", value: pastDueBusinesses, icon: AlertTriangle, color: "text-red-600 bg-red-50" },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-3 p-3 rounded-xl bg-[#f8f7f4]">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${item.color}`}>
                  <item.icon size={15} />
                </div>
                <span className="text-sm text-[#3d3d4d] flex-1">{item.label}</span>
                <span className="font-syne font-bold text-lg">{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent tenants */}
        <div className="bg-white rounded-2xl border border-[#e8e6e0] p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-syne font-semibold text-[15px]">Recent Tenants</h2>
            <Link href="/admin/tenants" className="text-xs text-accent hover:underline">View all</Link>
          </div>
          <div className="space-y-3">
            {recentTenants.map((t) => (
              <div key={t.id} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center text-accent text-xs font-bold flex-shrink-0">
                  {t.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{t.name}</p>
                  <p className="text-xs text-[#6b6b80] truncate">{t.owner.email}</p>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${
                  t.plan === "trial" ? "bg-gray-100 text-gray-500" :
                  t.plan === "starter" ? "bg-blue-50 text-blue-600" :
                  t.plan === "professional" ? "bg-sky-50 text-sky-700" :
                  "bg-amber-50 text-amber-700"
                }`}>{t.plan}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
