import { requireAdminPage } from "@/lib/admin/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export default async function AdminRevenuePage() {
  await requireAdminPage();

  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

  // Last 6 months
  const months: { label: string; start: Date; end: Date }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
    months.push({ label: start.toLocaleDateString("en-US", { month: "short", year: "2-digit" }), start, end });
  }

  const monthlyRevenue = await Promise.all(
    months.map(m => prisma.appointment.aggregate({
      where: { date: { gte: m.start, lte: m.end }, paymentStatus: "paid" },
      _sum: { price: true },
      _count: { id: true },
    }))
  );

  const topTenants = await prisma.business.findMany({
    include: {
      owner: { select: { email: true } },
      _count: { select: { appointments: true } },
    },
    orderBy: { createdAt: "asc" },
    take: 20,
  });

  const tenantRevenue = await prisma.appointment.groupBy({
    by: ["businessId"],
    where: { createdAt: { gte: monthStart }, paymentStatus: "paid" },
    _sum: { price: true },
    _count: { id: true },
    orderBy: { _sum: { price: "desc" } },
    take: 10,
  });

  const bizMap = new Map(topTenants.map(b => [b.id, b]));

  const totalAllTime = await prisma.appointment.aggregate({ where: { paymentStatus: "paid" }, _sum: { price: true } });
  const totalThisMonth = monthlyRevenue[5];
  const maxRevenue = Math.max(...monthlyRevenue.map(m => m._sum.price ?? 0), 1);

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="font-syne font-bold text-2xl">Revenue</h1>
        <p className="text-[#6b6b80] text-sm mt-1">Platform-wide booking revenue across all tenants</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "All-time Revenue", value: `$${(totalAllTime._sum.price ?? 0).toFixed(0)}` },
          { label: "This Month", value: `$${(totalThisMonth._sum.price ?? 0).toFixed(0)}` },
          { label: "This Month Bookings", value: totalThisMonth._count.id },
          { label: "Avg per Booking", value: totalThisMonth._count.id > 0 ? `$${((totalThisMonth._sum.price ?? 0) / totalThisMonth._count.id).toFixed(0)}` : "$0" },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-[#e8e6e0] p-5">
            <p className="font-syne font-bold text-2xl">{s.value}</p>
            <p className="text-[#6b6b80] text-xs mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Bar chart (CSS-based) */}
      <div className="bg-white rounded-2xl border border-[#e8e6e0] p-6">
        <h2 className="font-syne font-semibold text-[15px] mb-6">Monthly Revenue (Last 6 Months)</h2>
        <div className="flex items-end gap-3 h-40">
          {monthlyRevenue.map((m, i) => {
            const rev = m._sum.price ?? 0;
            const pct = (rev / maxRevenue) * 100;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-2">
                <span className="text-xs font-semibold text-[#3d3d4d]">${rev.toFixed(0)}</span>
                <div className="w-full bg-[#f0ede8] rounded-t-lg relative" style={{ height: "80px" }}>
                  <div className="absolute bottom-0 left-0 right-0 bg-accent rounded-t-lg transition-all" style={{ height: `${Math.max(pct, 2)}%` }} />
                </div>
                <span className="text-[10px] text-[#6b6b80]">{months[i].label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Top tenants by revenue */}
      <div className="bg-white rounded-2xl border border-[#e8e6e0] overflow-hidden">
        <div className="px-6 py-4 border-b border-[#f0ede8]">
          <h2 className="font-syne font-semibold text-[15px]">Top Tenants by Revenue (This Month)</h2>
        </div>
        {tenantRevenue.length === 0 ? (
          <div className="p-8 text-center text-[#6b6b80] text-sm">No paid appointments this month yet</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#fafaf8] border-b border-[#f0ede8]">
                {["#", "Business", "Owner", "Bookings", "Revenue"].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-[#6b6b80] first:pl-6 last:pr-6">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f5f3ef]">
              {tenantRevenue.map((tr, i) => {
                const biz = bizMap.get(tr.businessId);
                return (
                  <tr key={tr.businessId} className="hover:bg-[#fafaf8] transition-colors">
                    <td className="px-4 py-3 pl-6 text-[#6b6b80] font-medium">#{i + 1}</td>
                    <td className="px-4 py-3 font-semibold">{biz?.name ?? "Unknown"}</td>
                    <td className="px-4 py-3 text-[#6b6b80] text-xs">{biz?.owner.email ?? "—"}</td>
                    <td className="px-4 py-3">{tr._count.id}</td>
                    <td className="px-4 py-3 pr-6 font-syne font-bold text-accent">${(tr._sum.price ?? 0).toFixed(0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
