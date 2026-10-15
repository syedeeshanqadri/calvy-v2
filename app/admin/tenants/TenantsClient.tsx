"use client";
import { useState } from "react";
import { Search, ChevronDown, Trash2, RefreshCw, Clock, Crown, ExternalLink, AlertTriangle } from "lucide-react";

const PLANS = ["trial", "starter", "professional", "business"];
const STATUSES = ["trialing", "active", "past_due", "cancelled"];

const PLAN_BADGE: Record<string, string> = {
  trial: "bg-gray-100 text-gray-600",
  starter: "bg-blue-50 text-blue-700",
  professional: "bg-sky-50 text-sky-700",
  business: "bg-amber-50 text-amber-700",
};
const STATUS_BADGE: Record<string, string> = {
  trialing: "bg-amber-50 text-amber-700",
  active: "bg-green-50 text-green-700",
  past_due: "bg-red-50 text-red-700",
  cancelled: "bg-gray-100 text-gray-500",
};

interface Tenant {
  id: string; name: string; slug: string; plan: string; planStatus: string;
  trialEndsAt: string | null; currency: string; businessType: string; email: string | null;
  createdAt: string;
  owner: { name: string; email: string };
  counts: { appointments: number; clients: number; staff: number; services: number };
  monthly: { count: number; revenue: number };
}

export function TenantsClient({ initialTenants }: { initialTenants: Tenant[] }) {
  const [tenants, setTenants] = useState(initialTenants);
  const [saving, setSaving] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterPlan, setFilterPlan] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  async function reload() {
    const res = await fetch("/api/admin/tenants");
    const data = await res.json();
    setTenants(data.tenants ?? []);
  }

  async function updateTenant(id: string, patch: Record<string, string | null>) {
    setSaving(id);
    await fetch(`/api/admin/tenants/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    await reload();
    setSaving(null);
  }

  async function extendTrial(id: string) {
    const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    await updateTenant(id, { plan: "trial", planStatus: "trialing", trialEndsAt });
  }

  async function deleteTenant(t: Tenant) {
    const typed = window.prompt(`Permanently delete "${t.name}" and ALL their data?\nType the slug "${t.slug}" to confirm.`);
    if (typed !== t.slug) return;
    setSaving(t.id);
    await fetch(`/api/admin/tenants/${t.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: typed }),
    });
    await reload();
    setSaving(null);
  }

  const filtered = tenants.filter((t) => {
    const q = search.toLowerCase();
    return (
      (t.name.toLowerCase().includes(q) || t.owner.email.toLowerCase().includes(q) || t.slug.includes(q)) &&
      (filterPlan === "all" || t.plan === filterPlan) &&
      (filterStatus === "all" || t.planStatus === filterStatus)
    );
  });

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-syne font-bold text-2xl">Tenants</h1>
          <p className="text-[#6b6b80] text-sm mt-1">{tenants.length} registered businesses</p>
        </div>
        <button onClick={reload} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-[#e8e6e0] text-sm text-[#6b6b80] hover:text-accent transition-colors">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6b6b80]" />
          <input className="w-full h-10 pl-9 pr-4 rounded-xl border border-[#e8e6e0] bg-white text-sm outline-none focus:border-accent/40" placeholder="Search by name, email, slug…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="h-10 px-3 rounded-xl border border-[#e8e6e0] bg-white text-sm outline-none" value={filterPlan} onChange={e => setFilterPlan(e.target.value)}>
          <option value="all">All plans</option>
          {PLANS.map(p => <option key={p} value={p} className="capitalize">{p}</option>)}
        </select>
        <select className="h-10 px-3 rounded-xl border border-[#e8e6e0] bg-white text-sm outline-none" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">All statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-[#e8e6e0] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#fafaf8] border-b border-[#f0ede8]">
                {["Business", "Owner", "Plan", "Status", "Usage", "Revenue", "Joined", "Actions"].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-[#6b6b80] first:pl-6 last:pr-6 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f5f3ef]">
              {filtered.map(t => (
                <tr key={t.id} className="hover:bg-[#fafaf8] transition-colors">
                  <td className="px-4 py-3 pl-6">
                    <p className="font-semibold">{t.name}</p>
                    <p className="text-xs text-[#6b6b80]">/{t.slug}</p>
                    <p className="text-xs text-[#6b6b80] capitalize">{t.businessType} · {t.currency}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{t.owner.name}</p>
                    <p className="text-xs text-[#6b6b80]">{t.owner.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="relative inline-flex items-center">
                      <select
                        value={t.plan}
                        disabled={saving === t.id}
                        onChange={e => updateTenant(t.id, { plan: e.target.value })}
                        className={`text-xs font-semibold pl-2 pr-6 py-1 rounded-lg border-0 outline-none cursor-pointer appearance-none ${PLAN_BADGE[t.plan] ?? "bg-gray-100 text-gray-600"}`}
                      >
                        {PLANS.map(p => <option key={p} value={p} className="bg-white text-gray-800 capitalize">{p}</option>)}
                      </select>
                      <ChevronDown size={11} className="absolute right-1.5 pointer-events-none text-current opacity-60" />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="relative inline-flex items-center">
                      <select
                        value={t.planStatus}
                        disabled={saving === t.id}
                        onChange={e => updateTenant(t.id, { planStatus: e.target.value })}
                        className={`text-xs font-semibold pl-2 pr-6 py-1 rounded-lg border-0 outline-none cursor-pointer appearance-none ${STATUS_BADGE[t.planStatus] ?? "bg-gray-100 text-gray-500"}`}
                      >
                        {STATUSES.map(s => <option key={s} value={s} className="bg-white text-gray-800">{s.replace("_", " ")}</option>)}
                      </select>
                      <ChevronDown size={11} className="absolute right-1.5 pointer-events-none text-current opacity-60" />
                    </div>
                    {t.plan === "trial" && t.trialEndsAt && (
                      <p className="text-[10px] text-[#6b6b80] mt-1">Expires {new Date(t.trialEndsAt).toLocaleDateString()}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-[#6b6b80]">
                    <p>{t.counts.appointments} appts</p>
                    <p>{t.counts.clients} clients</p>
                    <p>{t.counts.staff} staff</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold">${t.monthly.revenue.toFixed(0)}</p>
                    <p className="text-xs text-[#6b6b80]">this month</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-[#6b6b80]">{new Date(t.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3 pr-6">
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => extendTrial(t.id)} disabled={saving === t.id} title="+14 day trial" className="p-1.5 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 transition-colors disabled:opacity-40">
                        <Clock size={13} />
                      </button>
                      <a href={`/b/${t.slug}`} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg bg-[#f8f7f4] text-[#6b6b80] hover:bg-[#f0ede8] transition-colors" title="View booking page">
                        <ExternalLink size={13} />
                      </a>
                      <button onClick={() => deleteTenant(t)} disabled={saving === t.id} className="p-1.5 rounded-lg text-[#6b6b80] hover:bg-red-50 hover:text-red-500 transition-colors disabled:opacity-40">
                        <Trash2 size={13} />
                      </button>
                      {saving === t.id && <RefreshCw size={12} className="animate-spin text-accent" />}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="px-6 py-12 text-center text-[#6b6b80] text-sm">No tenants found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-start gap-2 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 text-xs">
        <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
        Plan changes take effect immediately. They do not modify Stripe — use the Stripe dashboard to manage actual billing.
      </div>
    </div>
  );
}
