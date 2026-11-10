import Link from "next/link";
import { requireAdminPage } from "@/lib/admin/auth";
import { loadAdminStats } from "@/lib/admin/stats";
import { formatCurrencyAmount } from "@/lib/currency";

export const dynamic = "force-dynamic";

function Tile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-[#e8e6e0] p-5">
      <p className="text-xs font-semibold text-[#6b6b80] uppercase tracking-wider">{label}</p>
      <p className="font-syne font-bold text-3xl mt-1">{value}</p>
      {sub && <p className="text-xs text-[#6b6b80] mt-1">{sub}</p>}
    </div>
  );
}

function Breakdown({ title, data, filterKey }: { title: string; data: Record<string, number>; filterKey: string }) {
  const rows = Object.entries(data).sort((a, b) => b[1] - a[1]);
  return (
    <div className="bg-white rounded-2xl border border-[#e8e6e0] p-5">
      <p className="text-sm font-semibold mb-3">{title}</p>
      <ul className="space-y-1.5">
        {rows.length === 0 && <li className="text-sm text-[#6b6b80]">None yet</li>}
        {rows.map(([k, n]) => (
          <li key={k} className="flex justify-between text-sm"><Link className="hover:underline" href={`/admin/businesses?${filterKey}=${encodeURIComponent(k)}`}>{k}</Link><span className="font-semibold">{n}</span></li>
        ))}
      </ul>
    </div>
  );
}

export default async function AdminOverviewPage() {
  await requireAdminPage();
  const s = await loadAdminStats();
  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="font-syne font-bold text-2xl">Overview</h1>
        <p className="text-sm text-[#6b6b80]">Counts only. No customer details.</p>
      </div>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4" aria-label="Totals">
        <Tile label="Businesses" value={s.businesses.total} sub={s.businesses.suspended ? `${s.businesses.suspended} suspended` : "none suspended"} />
        <Tile label="Sign-ups" value={s.signups.last7} sub={`last 7 days · ${s.signups.last30} in 30 days`} />
        <Tile label="Active" value={s.activity.active} sub={`booked in the last 30 days · ${s.activity.dormant} dormant`} />
        <Tile label={`Rs 10 fee revenue${s.feeRevenue.sandbox ? " (sandbox)" : ""}`} value={formatCurrencyAmount(s.feeRevenue.totalMinor / 100, "INR")} sub={`${formatCurrencyAmount(s.feeRevenue.last30Minor / 100, "INR")} in 30 days`} />
      </section>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4" aria-label="Bookings">
        <Tile label="Bookings today" value={s.bookings.today} />
        <Tile label="Bookings, 7 days" value={s.bookings.last7} />
        <Tile label="Bookings, 30 days" value={s.bookings.last30} />
        <Tile label="Notification failures" value={s.notificationFailures.last7} sub={s.notificationFailures.byTemplate.map((t) => `${t.template} ${t.count}`).join(" · ") || "none in 7 days"} />
      </section>

      <section className="grid md:grid-cols-3 gap-4" aria-label="Businesses by">
        <Breakdown title="By business type" data={s.businesses.byPack} filterKey="pack" />
        <Breakdown title="By region" data={s.businesses.byRegion} filterKey="region" />
        <Breakdown title="By plan" data={s.businesses.byPlan} filterKey="plan" />
      </section>
    </div>
  );
}
