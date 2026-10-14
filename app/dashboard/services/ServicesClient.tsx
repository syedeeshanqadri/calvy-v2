"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Clock, Plus, MoreVertical, ToggleLeft, ToggleRight, Trash2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCurrency } from "@/components/providers/CurrencyProvider";
import { CURRENCIES } from "@/lib/currency";

interface ServiceRow {
  id: string; name: string; description: string; duration: number;
  price: number; color: string; category: string; isActive: boolean; capacity: number;
}

const PRESET_COLORS = ["#0284c7","#3b82f6","#22c55e","#8b5cf6","#f59e0b","#ec4899","#14b8a6","#f97316"];

export function ServicesClient({ services: initial, groupBooking = false }: { services: ServiceRow[]; groupBooking?: boolean }) {
  const { formatPrice, currency } = useCurrency();
  const currencySymbol = CURRENCIES.find(c => c.code === currency)?.symbol ?? currency;
  const router = useRouter();
  const [services, setServices] = useState(initial);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editService, setEditService] = useState<ServiceRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ServiceRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", description: "", duration: "60", price: "0", color: "#0284c7", category: "General", capacity: "1" });

  const toggleActive = async (id: string) => {
    const svc = services.find(s => s.id === id);
    if (!svc) return;
    const newVal = !svc.isActive;
    setServices(prev => prev.map(s => s.id === id ? { ...s, isActive: newVal } : s));
    await fetch(`/api/services/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: newVal }),
    });
  };

  const openEdit = (svc: ServiceRow) => {
    setEditService(svc);
    setForm({ name: svc.name, description: svc.description, duration: String(svc.duration), price: String(svc.price), color: svc.color, category: svc.category, capacity: String(svc.capacity ?? 1) });
    setError("");
  };

  const openAdd = () => {
    setEditService(null);
    setForm({ name: "", description: "", duration: "60", price: "0", color: "#0284c7", category: "General", capacity: "1" });
    setError("");
    setShowAddModal(true);
  };

  const submitForm = async () => {
    setLoading(true);
    setError("");
    const dur = Number(form.duration);
    const prc = Number(form.price);
    if (dur < 1) { setError("Duration must be at least 1 minute"); setLoading(false); return; }
    if (prc < 0) { setError("Price cannot be negative"); setLoading(false); return; }
    try {
      const payload = { name: form.name, description: form.description, duration: dur, price: prc, color: form.color, category: form.category, capacity: Math.max(1, Number(form.capacity) || 1) };
      let res: Response;
      if (editService) {
        res = await fetch(`/api/services/${editService.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      } else {
        res = await fetch("/api/services", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save service");
      setShowAddModal(false);
      setEditService(null);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/services/${deleteTarget.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete");
      setDeleteTarget(null);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setDeleteTarget(null);
    } finally {
      setDeleteLoading(false);
    }
  };

  const modalOpen = showAddModal || editService !== null;
  const modalTitle = editService ? "Edit Service" : "Add New Service";

  return (
    <DashboardLayout title="Services" subtitle={`${services.filter(s => s.isActive).length} active services`}>
      <div className="flex justify-between items-center mb-6">
        <p className="text-sm text-[#6b6b80]">Manage the services your business offers and their pricing.</p>
        <Button size="sm" className="gap-1.5" onClick={openAdd}><Plus size={14} /> Add service</Button>
      </div>

      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
        {services.map((service) => (
          <Card key={service.id} className={cn("p-5 transition-opacity", !service.isActive && "opacity-55")}>
            <div className="flex items-start justify-between mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: service.color + "20" }}>
                <div className="w-4 h-4 rounded-full" style={{ background: service.color }} />
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => toggleActive(service.id)} className="text-[#6b6b80] hover:text-brand-800 transition-colors">
                  {service.isActive ? <ToggleRight size={22} className="text-accent" /> : <ToggleLeft size={22} />}
                </button>
                <button onClick={() => openEdit(service)} className="w-7 h-7 rounded-lg flex items-center justify-center text-[#6b6b80] hover:bg-[#f8f7f4] transition-colors">
                  <MoreVertical size={14} />
                </button>
                <button onClick={() => setDeleteTarget(service)} className="w-7 h-7 rounded-lg flex items-center justify-center text-[#6b6b80] hover:bg-red-50 hover:text-red-500 transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            <h3 className="font-syne font-bold text-base mb-1">{service.name}</h3>
            <p className="text-xs text-[#6b6b80] mb-4 leading-relaxed">{service.description}</p>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5 text-sm"><Clock size={14} className="text-[#6b6b80]" /><span className="font-medium">{service.duration}min</span></div>
              <div className="flex items-center text-sm font-bold text-accent">{formatPrice(service.price)}</div>
              {service.capacity > 1 && (
                <div className="flex items-center gap-1 text-xs font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">
                  <Users size={11} />{service.capacity} spots
                </div>
              )}
            </div>
            <div className="mt-3 pt-3 border-t border-[#f0ede8] flex items-center justify-between">
              <span className={cn("text-xs font-semibold px-2 py-1 rounded-full", service.isActive ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500")}>
                {service.isActive ? "Active" : "Inactive"}
              </span>
              <button onClick={() => openEdit(service)} className="text-xs text-accent font-medium hover:underline">Edit service</button>
            </div>
          </Card>
        ))}

        <button onClick={openAdd} className="border-2 border-dashed border-[#e8e6e0] rounded-2xl p-5 flex flex-col items-center justify-center gap-3 hover:border-accent/40 transition-all group min-h-[200px]">
          <div className="w-10 h-10 rounded-xl bg-[#f8f7f4] group-hover:bg-accent/10 flex items-center justify-center transition-colors">
            <Plus size={20} className="text-[#6b6b80] group-hover:text-accent transition-colors" />
          </div>
          <div className="text-sm font-medium text-[#6b6b80] group-hover:text-accent transition-colors">Add new service</div>
        </button>
      </div>

      {/* Add / Edit modal */}
      <Modal isOpen={modalOpen} onClose={() => { setShowAddModal(false); setEditService(null); }} title={modalTitle} size="md">
        <div className="space-y-4">
          <Input label="Service name" placeholder="e.g. Haircut & Style" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <div>
            <label className="text-sm font-medium text-brand-800 block mb-1.5">Description</label>
            <textarea className="w-full rounded-xl border border-[#e8e6e0] px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all" rows={2} placeholder="Brief description of this service..." value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Duration (minutes)" type="number" min="1" step="5" value={form.duration} onChange={e => setForm({ ...form, duration: e.target.value })} />
            <Input label={`Price (${currencySymbol})`} type="number" min="0" step="0.01" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} />
          </div>
          {groupBooking && (
            <div>
              <label className="text-sm font-medium text-brand-800 block mb-1.5">Max participants <span className="text-[#6b6b80] font-normal">(1 = individual, 2+ = group booking)</span></label>
              <Input type="number" min="1" max="100" step="1" value={form.capacity} onChange={e => setForm({ ...form, capacity: e.target.value })} />
            </div>
          )}
          <div>
            <label className="text-sm font-medium text-brand-800 block mb-2">Color</label>
            <div className="flex items-center gap-2 flex-wrap">
              {PRESET_COLORS.map(c => (
                <button key={c} onClick={() => setForm({ ...form, color: c })} className={cn("w-7 h-7 rounded-full border-2 transition-all", form.color === c ? "border-brand-900 scale-110" : "border-transparent")} style={{ background: c }} />
              ))}
              <input type="color" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} className="w-7 h-7 rounded-full border border-[#e8e6e0] cursor-pointer p-0.5 bg-white" title="Custom color" />
            </div>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={() => { setShowAddModal(false); setEditService(null); }} className="flex-1 justify-center">Cancel</Button>
            <Button onClick={submitForm} disabled={loading || !form.name || !form.duration} className="flex-1 justify-center">
              {loading ? "Saving..." : editService ? "Save changes" : "Add service"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Service" size="sm">
        {deleteTarget && (
          <div className="space-y-4">
            <p className="text-sm text-[#3d3d4d]">
              Are you sure you want to delete <strong>{deleteTarget.name}</strong>?
            </p>
            <p className="text-xs text-[#6b6b80] bg-amber-50 border border-amber-100 rounded-xl p-3">
              If this service has existing appointments, it will be <strong>deactivated</strong> instead of deleted to preserve booking history.
            </p>
            <div className="flex gap-3 pt-1">
              <Button variant="outline" onClick={() => setDeleteTarget(null)} className="flex-1 justify-center">Cancel</Button>
              <button onClick={confirmDelete} disabled={deleteLoading} className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold disabled:opacity-60 transition-colors">
                {deleteLoading ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </DashboardLayout>
  );
}
