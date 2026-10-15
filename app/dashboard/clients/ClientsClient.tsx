"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { useCurrency } from "@/components/providers/CurrencyProvider";
import Link from "next/link";
import { Search, Plus, Mail, Phone, Star } from "lucide-react";

interface ClientRow {
  id: string; name: string; email: string; phone: string;
  totalAppointments: number; totalSpent: number; lastVisit: string | null; notes: string;
}

const COLORS = ["#0284c7","#3b82f6","#22c55e","#8b5cf6","#f59e0b","#ec4899","#14b8a6","#f97316"];

export function ClientsClient({ clients }: { clients: ClientRow[] }) {
  const router = useRouter();
  const { formatPrice } = useCurrency();
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", notes: "" });

  const filtered = clients.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.email.toLowerCase().includes(search.toLowerCase())
  );

  const submit = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `${form.firstName} ${form.lastName}`.trim(), email: form.email, phone: form.phone, notes: form.notes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add client");
      setForm({ firstName: "", lastName: "", email: "", phone: "", notes: "" });
      setShowModal(false);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout title="Clients" subtitle={`${clients.length} total clients`}>
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between mb-6">
        <div className="flex gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-none">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6b6b80]" />
            <input className="w-full sm:w-60 h-10 pl-9 pr-4 rounded-xl bg-white border border-[#e8e6e0] text-sm outline-none focus:border-accent/40 transition-all" placeholder="Search clients..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex gap-1 bg-white border border-[#e8e6e0] rounded-xl p-1">
            <button onClick={() => setView("grid")} className={`px-3 py-1.5 rounded-lg text-xs transition-all ${view === "grid" ? "bg-[#f8f7f4] text-brand-900" : "text-[#6b6b80]"}`}>Grid</button>
            <button onClick={() => setView("list")} className={`px-3 py-1.5 rounded-lg text-xs transition-all ${view === "list" ? "bg-[#f8f7f4] text-brand-900" : "text-[#6b6b80]"}`}>List</button>
          </div>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => { setError(""); setShowModal(true); }}><Plus size={14} /> Add client</Button>
      </div>

      {view === "grid" ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((client, i) => (
            // Stretched-link card: the Link overlays the card and the mailto/tel
            // anchors sit above it, so no <a> is nested inside another <a>.
            <div key={client.id} className="relative">
            <Card hover className="p-5 h-full">
              <Link
                href={`/dashboard/clients/${client.id}`}
                aria-label={`View ${client.name}`}
                className="absolute inset-0 z-0 rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              />
              <div className="flex items-start justify-between mb-4">
                <Avatar name={client.name} color={COLORS[i % COLORS.length]} size="lg" />
                {client.totalSpent > 500 && <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-full"><Star size={10} fill="currentColor" />VIP</span>}
              </div>
              <h3 className="font-semibold text-sm mb-0.5">{client.name}</h3>
              <p className="text-xs text-[#6b6b80] mb-3 truncate">{client.email}</p>
              <div className="grid grid-cols-2 gap-2 mb-4">
                <div className="bg-[#f8f7f4] rounded-lg p-2 text-center">
                  <div className="font-syne font-bold text-base">{client.totalAppointments}</div>
                  <div className="text-[10px] text-[#6b6b80]">Visits</div>
                </div>
                <div className="bg-[#f8f7f4] rounded-lg p-2 text-center">
                  <div className="font-syne font-bold text-base">{formatPrice(client.totalSpent)}</div>
                  <div className="text-[10px] text-[#6b6b80]">Spent</div>
                </div>
              </div>
              <div className="flex gap-2">
                <a href={`mailto:${client.email}`} className="relative z-10 flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg bg-[#f8f7f4] hover:bg-[#f0ede8] text-xs font-medium text-[#6b6b80] hover:text-brand-800 transition-colors">
                  <Mail size={12} /> Email
                </a>
                {client.phone && (
                  <a href={`tel:${client.phone}`} className="relative z-10 flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg bg-[#f8f7f4] hover:bg-[#f0ede8] text-xs font-medium text-[#6b6b80] hover:text-brand-800 transition-colors">
                    <Phone size={12} /> Call
                  </a>
                )}
              </div>
            </Card>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full text-center py-16 text-[#6b6b80] text-sm">No clients found</div>
          )}
        </div>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-[#fafaf8] border-b border-[#f0ede8]">
                  {["Name", "Contact", "Total visits", "Total spent", "Last visit", ""].map((h) => (
                    <th key={h} className="text-left text-xs font-semibold text-[#6b6b80] px-4 py-3 first:pl-6 last:pr-6">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((client, i) => (
                  <tr key={client.id} className="border-b border-[#f5f3ef] last:border-0 hover:bg-[#fafaf8] transition-colors">
                    <td className="px-4 py-3 pl-6">
                      <div className="flex items-center gap-3">
                        <Avatar name={client.name} color={COLORS[i % COLORS.length]} size="sm" />
                        <div className="font-medium text-sm">{client.name}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs text-[#6b6b80]">{client.email}</div>
                      <div className="text-xs text-[#6b6b80]">{client.phone}</div>
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold">{client.totalAppointments}</td>
                    <td className="px-4 py-3 text-sm font-semibold">{formatPrice(client.totalSpent)}</td>
                    <td className="px-4 py-3 text-sm text-[#6b6b80]">{client.lastVisit ?? "—"}</td>
                    <td className="px-4 py-3 pr-6"><Link href={`/dashboard/clients/${client.id}`} className="text-xs text-accent hover:underline font-medium">View</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Add New Client" size="md">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="First name" placeholder="John" value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} />
            <Input label="Last name" placeholder="Doe" value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} />
          </div>
          <Input label="Email" type="email" placeholder="john@email.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          <Input
            label="Phone"
            type="tel"
            placeholder="+1 5550000"
            value={form.phone}
            onChange={e => setForm({ ...form, phone: e.target.value })}
            onKeyDown={e => {
              const allowed = ["Backspace","Delete","ArrowLeft","ArrowRight","Tab","Enter","+"];
              if (!allowed.includes(e.key) && !/^\d$/.test(e.key)) e.preventDefault();
            }}
          />
          <Input label="Notes (optional)" placeholder="Any important info..." value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={() => setShowModal(false)} className="flex-1 justify-center">Cancel</Button>
            <Button onClick={submit} disabled={loading || !form.firstName || !form.email} className="flex-1 justify-center">
              {loading ? "Saving..." : "Add Client"}
            </Button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
}
