import Link from "next/link";
import { requireAdminPage } from "@/lib/admin/auth";
import { businessFilterSchema, listBusinesses } from "@/lib/admin/businesses";
import { PACK_IDS } from "@/lib/packs/types";

export const dynamic = "force-dynamic";

const field = "h-10 rounded-xl border border-[#e8e6e0] bg-white px-3 text-sm";

export default async function AdminBusinessesPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdminPage();
  const raw = await props.searchParams;
  const parsed = businessFilterSchema.safeParse(Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])));
  const f = parsed.success ? parsed.data : businessFilterSchema.parse({});
  const { rows, total, pages } = await listBusinesses(f);

  const qs = (over: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...f, ...over })) if (v !== undefined && v !== "" && !(k === "page" && v === 1)) p.set(k, String(v));
    return `/admin/businesses?${p}`;
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="font-syne font-bold text-2xl">Businesses</h1><p className="text-sm text-[#6b6b80]">{total} found</p></div>
        <Link href="/admin/businesses/new" className="h-10 px-4 inline-flex items-center rounded-xl bg-accent text-white text-sm font-semibold">Create business</Link>
      </div>

      <form method="get" className="flex flex-wrap gap-2 items-end" aria-label="Filters">
        <input name="q" defaultValue={f.q} placeholder="Search name, address or owner email" className={`${field} w-64`} aria-label="Search" />
        <select name="pack" defaultValue={f.pack ?? ""} className={field} aria-label="Business type"><option value="">Any type</option>{PACK_IDS.map((p) => <option key={p} value={p}>{p}</option>)}</select>
        <select name="region" defaultValue={f.region ?? ""} className={field} aria-label="Region"><option value="">Any region</option><option value="IN">India</option><option value="INTL">International</option></select>
        <select name="plan" defaultValue={f.plan ?? ""} className={field} aria-label="Plan"><option value="">Any plan</option><option value="free">free</option><option value="professional">professional</option><option value="business">business</option></select>
        <select name="status" defaultValue={f.status ?? ""} className={field} aria-label="Status"><option value="">Any status</option><option value="active">Active (booked in 30 days)</option><option value="dormant">Dormant</option><option value="suspended">Suspended</option></select>
        <label className="text-xs text-[#6b6b80]">Signed up from<input type="date" name="from" defaultValue={f.from} className={`${field} block`} /></label>
        <label className="text-xs text-[#6b6b80]">to<input type="date" name="to" defaultValue={f.to} className={`${field} block`} /></label>
        <button type="submit" className="h-10 px-4 rounded-xl border border-[#e8e6e0] bg-white text-sm font-semibold">Filter</button>
        <Link href="/admin/businesses" className="h-10 px-2 inline-flex items-center text-sm text-[#6b6b80] hover:underline">Clear</Link>
      </form>

      <div className="bg-white rounded-2xl border border-[#e8e6e0] overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="bg-[#fafaf8] text-left text-xs text-[#6b6b80]">{["Business", "Owner", "Type", "Region", "Plan", "Status", "Bookings", "Signed up"].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id} className="border-t border-[#f0ede8] hover:bg-[#fafaf8]">
                <td className="px-4 py-3"><Link href={`/admin/businesses/${b.id}`} className="font-semibold hover:underline">{b.name}</Link><div className="text-xs text-[#6b6b80]">{b.slug}</div></td>
                <td className="px-4 py-3 text-[#6b6b80]">{b.owner.email}</td>
                <td className="px-4 py-3">{b.packId}</td>
                <td className="px-4 py-3">{b.region}</td>
                <td className="px-4 py-3">{b.plan}{b.planOverridePlan ? <span className="ml-1 text-[10px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full">override</span> : null}</td>
                <td className="px-4 py-3">{b.suspendedAt ? <span className="text-red-700 font-semibold">Suspended</span> : b.onboardingCompletedAt ? "Live" : "Setting up"}</td>
                <td className="px-4 py-3">{b._count.appointments}</td>
                <td className="px-4 py-3 text-[#6b6b80]">{b.createdAt.toISOString().slice(0, 10)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-[#6b6b80]">No businesses match.</td></tr>}
          </tbody>
        </table>
      </div>

      <nav className="flex items-center justify-between text-sm" aria-label="Pages">
        <span className="text-[#6b6b80]">Page {f.page} of {pages}</span>
        <span className="flex gap-2">
          {f.page > 1 && <Link href={qs({ page: f.page - 1 })} className="px-3 py-2 rounded-lg border border-[#e8e6e0] bg-white">Previous</Link>}
          {f.page < pages && <Link href={qs({ page: f.page + 1 })} className="px-3 py-2 rounded-lg border border-[#e8e6e0] bg-white">Next</Link>}
        </span>
      </nav>
    </div>
  );
}
