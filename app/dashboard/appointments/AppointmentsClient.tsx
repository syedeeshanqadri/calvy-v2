"use client";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { formatTime } from "@/lib/utils";
import { useCurrency } from "@/components/providers/CurrencyProvider";
import { Search, Filter, Download, Plus, CalendarX, Check, Clock, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";

type ApptStatus = "confirmed" | "pending" | "cancelled" | "completed" | "no-show";

const TABS: { label: string; status?: ApptStatus }[] = [
  { label: "All" }, { label: "Confirmed", status: "confirmed" }, { label: "Pending", status: "pending" },
  { label: "Completed", status: "completed" }, { label: "Cancelled", status: "cancelled" },
];

const PAYMENT_STATUS_STYLES: Record<string, string> = {
  paid:     "bg-green-50 text-green-700 border border-green-200",
  unpaid:   "bg-amber-50 text-amber-700 border border-amber-200",
  refunded: "bg-gray-100 text-gray-500 border border-gray-200",
};

interface Row {
  id: string; clientName: string; clientEmail: string; serviceName: string;
  staffName: string; date: string; time: string; duration: number; price: number;
  status: string; paymentStatus: string; paymentMode: string; color: string; notes?: string;
}
interface ServiceOption { id: string; name: string; duration: number; price: number; }
interface StaffOption { id: string; name: string; }

const today = new Date().toISOString().split("T")[0];

function downloadCSV(rows: Row[], formatPrice: (n: number) => string) {
  const headers = ["Client", "Email", "Service", "Staff", "Date", "Time", "Duration", "Price", "Status", "Payment"];
  const lines = [
    headers.join(","),
    ...rows.map(r => [
      `"${r.clientName}"`, `"${r.clientEmail}"`, `"${r.serviceName}"`, `"${r.staffName}"`,
      r.date, r.time, `${r.duration}min`, formatPrice(r.price), r.status, r.paymentStatus,
    ].join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `appointments-${today}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function AppointmentsClient({ appointments, services, staff, csvExport = false }: { appointments: Row[]; services: ServiceOption[]; staff: StaffOption[]; csvExport?: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { formatPrice } = useCurrency();
  const [activeTab, setActiveTab] = useState("All");
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [viewAppt, setViewAppt] = useState<Row | null>(null);
  const [editStatus, setEditStatus] = useState("");
  const [editPaymentStatus, setEditPaymentStatus] = useState("");
  const [editPaymentMode, setEditPaymentMode] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [filterStaff, setFilterStaff] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ clientName: "", clientEmail: "", serviceIds: [] as string[], staffId: "", date: today, time: "09:00", notes: "" });

  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setError("");
      setShowModal(true);
      router.replace("/dashboard/appointments");
    }
  }, [searchParams, router]);

  function openView(appt: Row) {
    setViewAppt(appt);
    setEditStatus(appt.status);
    setEditPaymentStatus(appt.paymentStatus);
    setEditPaymentMode(appt.paymentMode);
    setSaveError("");
    setSaved(false);
  }

  function closeView() {
    setViewAppt(null);
    setSaveError("");
    setSaved(false);
  }

  const isDirty = viewAppt && (
    editStatus !== viewAppt.status ||
    editPaymentStatus !== viewAppt.paymentStatus ||
    editPaymentMode !== viewAppt.paymentMode
  );

  async function saveChanges() {
    if (!viewAppt) return;
    setSaving(true);
    setSaveError("");
    try {
      const res = await fetch(`/api/appointments/${viewAppt.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: editStatus,
          paymentStatus: editPaymentStatus,
          paymentMode: editPaymentMode,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      router.refresh();
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const filtered = appointments.filter((a) => {
    const matchTab = activeTab === "All" || a.status === TABS.find(t => t.label === activeTab)?.status;
    const q = search.toLowerCase();
    const matchSearch = a.clientName.toLowerCase().includes(q) || a.serviceName.toLowerCase().includes(q);
    const matchStaff = !filterStaff || a.staffName === filterStaff;
    const matchFrom = !filterDateFrom || a.date >= filterDateFrom;
    const matchTo = !filterDateTo || a.date <= filterDateTo;
    return matchTab && matchSearch && matchStaff && matchFrom && matchTo;
  });

  const activeFilters = [filterStaff, filterDateFrom, filterDateTo].filter(Boolean).length;

  const submit = async () => {
    setLoading(true);
    setError("");
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(form.clientEmail)) {
      setError("Please enter a valid email address.");
      setLoading(false);
      return;
    }
    try {
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create appointment");
      setShowModal(false);
      setForm({ clientName: "", clientEmail: "", serviceIds: [], staffId: "", date: today, time: "09:00", notes: "" });
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout title="Appointments" subtitle={`${appointments.length} total appointments`}>
      <Card>
        <div className="px-6 py-4 border-b border-[#f0ede8] flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex gap-1 bg-[#f8f7f4] rounded-xl p-1 flex-wrap">
            {TABS.map((tab) => (
              <button key={tab.label} onClick={() => setActiveTab(tab.label)} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${activeTab === tab.label ? "bg-white shadow text-brand-900" : "text-[#6b6b80] hover:text-brand-900"}`}>
                {tab.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:flex-none">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6b6b80]" />
              <input aria-label="Search appointments" className="w-full sm:w-52 h-9 pl-9 pr-4 rounded-xl bg-[#f8f7f4] text-sm outline-none border border-transparent focus:border-accent/30 focus:bg-white transition-all" placeholder="Search appointments..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="relative">
              <button
                onClick={() => setShowFilter(v => !v)}
                className={`h-9 px-3 rounded-xl border flex items-center gap-2 text-sm transition-colors ${activeFilters > 0 ? "border-accent bg-accent/5 text-accent" : "border-[#e8e6e0] bg-white text-[#6b6b80] hover:text-brand-800"}`}
              >
                <Filter size={14} /> Filter {activeFilters > 0 && <span className="w-4 h-4 rounded-full bg-accent text-white text-[10px] flex items-center justify-center">{activeFilters}</span>}
              </button>
              {showFilter && (
                <div className="absolute right-0 top-11 z-20 w-72 bg-white rounded-2xl border border-[#e8e6e0] shadow-xl p-4 space-y-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold">Filters</span>
                    <button onClick={() => { setFilterStaff(""); setFilterDateFrom(""); setFilterDateTo(""); }} className="text-xs text-accent hover:underline">Clear all</button>
                  </div>
                  <div>
                    <label htmlFor="appt-staff-member" className="text-xs font-medium text-[#6b6b80] block mb-1">Staff member</label>
                    <select id="appt-staff-member" className="w-full h-9 rounded-xl border border-[#e8e6e0] px-3 text-sm bg-white focus:outline-none focus:border-accent/40"
                      value={filterStaff} onChange={e => setFilterStaff(e.target.value)}>
                      <option value="">All staff</option>
                      {staff.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label htmlFor="appt-from" className="text-xs font-medium text-[#6b6b80] block mb-1">From</label>
                      <input id="appt-from" type="date" className="w-full h-9 rounded-xl border border-[#e8e6e0] px-3 text-sm bg-white focus:outline-none focus:border-accent/40"
                        value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} />
                    </div>
                    <div>
                      <label htmlFor="appt-to" className="text-xs font-medium text-[#6b6b80] block mb-1">To</label>
                      <input id="appt-to" type="date" className="w-full h-9 rounded-xl border border-[#e8e6e0] px-3 text-sm bg-white focus:outline-none focus:border-accent/40"
                        value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} />
                    </div>
                  </div>
                  <button onClick={() => setShowFilter(false)} className="w-full py-2 rounded-xl bg-[#f8f7f4] hover:bg-[#f0ede8] text-sm font-medium transition-colors">
                    Apply
                  </button>
                </div>
              )}
            </div>
            {csvExport && (
              <button
                onClick={() => downloadCSV(filtered, formatPrice)}
                className="h-9 px-3 rounded-xl border border-[#e8e6e0] bg-white text-[#6b6b80] hover:text-brand-800 flex items-center gap-2 text-sm transition-colors"
                title="Download CSV"
              >
                <Download size={14} />
              </button>
            )}
            <Button size="sm" className="gap-1.5" onClick={() => { setError(""); setShowModal(true); }}><Plus size={14} /> New</Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#fafaf8] border-b border-[#f0ede8]">
                {["Client", "Service", "Staff", "Date & Time", "Duration", "Price", "Status", "Payment", ""].map((h) => (
                  <th key={h} className="text-left text-xs font-semibold text-[#6b6b80] px-4 py-3 first:pl-6 last:pr-6">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((appt) => (
                <tr key={appt.id} className="border-b border-[#f5f3ef] last:border-0 hover:bg-[#fafaf8] transition-colors">
                  <td className="px-4 py-3 pl-6">
                    <div className="flex items-center gap-3">
                      <Avatar name={appt.clientName} color={appt.color} size="sm" />
                      <div>
                        <div className="text-sm font-medium">{appt.clientName}</div>
                        <div className="text-xs text-[#6b6b80]">{appt.clientEmail}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm">{appt.serviceName}</td>
                  <td className="px-4 py-3 text-sm text-[#6b6b80]">{appt.staffName}</td>
                  <td className="px-4 py-3 text-sm">{appt.date} · {formatTime(appt.time)}</td>
                  <td className="px-4 py-3 text-sm text-[#6b6b80]">{appt.duration}min</td>
                  <td className="px-4 py-3 text-sm font-semibold">{formatPrice(appt.price)}</td>
                  <td className="px-4 py-3"><StatusBadge status={appt.status as ApptStatus} /></td>
                  <td className="px-4 py-3">
                    <span className={cn("text-[11px] font-semibold px-2 py-1 rounded-full capitalize", PAYMENT_STATUS_STYLES[appt.paymentStatus] ?? PAYMENT_STATUS_STYLES.unpaid)}>
                      {appt.paymentStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3 pr-6">
                    <button onClick={() => openView(appt)} className="text-xs text-accent hover:underline font-medium">Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="text-center py-16 text-[#6b6b80]">
              <CalendarX size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No appointments found</p>
            </div>
          )}
        </div>
      </Card>

      {/* View / Edit appointment modal */}
      <Modal isOpen={!!viewAppt} onClose={closeView} title="Appointment Details" size="md">
        {viewAppt && (
          <div className="space-y-4">
            {/* Client */}
            <div className="flex items-center gap-3 pb-4 border-b border-[#f0ede8]">
              <Avatar name={viewAppt.clientName} color={viewAppt.color} size="lg" />
              <div>
                <p className="font-semibold">{viewAppt.clientName}</p>
                <p className="text-sm text-[#6b6b80]">{viewAppt.clientEmail}</p>
              </div>
            </div>

            {/* Read-only details */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                { label: "Service", value: viewAppt.serviceName },
                { label: "Staff", value: viewAppt.staffName || "—" },
                { label: "Date", value: viewAppt.date },
                { label: "Time", value: formatTime(viewAppt.time) },
                { label: "Duration", value: `${viewAppt.duration} min` },
                { label: "Price", value: formatPrice(viewAppt.price) },
              ].map(({ label, value }) => (
                <div key={label} className="bg-[#f8f7f4] rounded-xl p-3">
                  <p className="text-xs text-[#6b6b80] mb-0.5">{label}</p>
                  <p className="font-medium">{value}</p>
                </div>
              ))}
            </div>

            {viewAppt.notes && (
              <div className="bg-[#f8f7f4] rounded-xl p-3">
                <p className="text-xs text-[#6b6b80] mb-0.5">Notes</p>
                <p className="text-sm">{viewAppt.notes}</p>
              </div>
            )}

            {/* Editable fields */}
            <div className="pt-1 border-t border-[#f0ede8] space-y-3">
              <p className="text-xs font-bold text-[#6b6b80] uppercase tracking-wider">Update</p>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label htmlFor="appt-appointment-status" className="text-xs font-medium text-[#6b6b80] block mb-1.5">Appointment status</label>
                  <select id="appt-appointment-status"
                    value={editStatus}
                    onChange={e => setEditStatus(e.target.value)}
                    className="w-full h-9 rounded-xl border border-[#e8e6e0] px-3 text-sm bg-white focus:outline-none focus:border-accent/40 transition-all"
                  >
                    <option value="confirmed">Confirmed</option>
                    <option value="pending">Pending</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="no-show">No-show</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="appt-payment-status" className="text-xs font-medium text-[#6b6b80] block mb-1.5">Payment status</label>
                  <select id="appt-payment-status"
                    value={editPaymentStatus}
                    onChange={e => setEditPaymentStatus(e.target.value)}
                    className="w-full h-9 rounded-xl border border-[#e8e6e0] px-3 text-sm bg-white focus:outline-none focus:border-accent/40 transition-all"
                  >
                    <option value="unpaid">Unpaid</option>
                    <option value="paid">Paid</option>
                    <option value="refunded">Refunded</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="appt-payment-mode" className="text-xs font-medium text-[#6b6b80] block mb-1.5">Payment mode</label>
                  <select id="appt-payment-mode"
                    value={editPaymentMode}
                    onChange={e => setEditPaymentMode(e.target.value)}
                    className="w-full h-9 rounded-xl border border-[#e8e6e0] px-3 text-sm bg-white focus:outline-none focus:border-accent/40 transition-all"
                  >
                    <option value="postpaid">Pay at venue</option>
                    <option value="prepaid">Prepaid</option>
                  </select>
                </div>
              </div>

              {saveError && <p className="text-sm text-red-500">{saveError}</p>}

              <div className="flex gap-3 pt-1">
                <Button variant="outline" onClick={closeView} className="flex-1 justify-center">Close</Button>
                <Button
                  onClick={saveChanges}
                  disabled={saving || !isDirty}
                  className={cn("flex-1 justify-center gap-2", saved && "bg-green-600 hover:bg-green-700")}
                >
                  {saved ? <><Check size={14} /> Saved</> : saving ? "Saving…" : "Save changes"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* New appointment modal */}
      <Modal isOpen={showModal} onClose={() => { setShowModal(false); setError(""); setForm({ clientName: "", clientEmail: "", serviceIds: [], staffId: "", date: today, time: "09:00", notes: "" }); }} title="New Appointment" size="md">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Client name" placeholder="Jane Smith" value={form.clientName} onChange={e => setForm({ ...form, clientName: e.target.value })} />
            <Input label="Client email" type="email" placeholder="jane@email.com" value={form.clientEmail} onChange={e => setForm({ ...form, clientEmail: e.target.value })} />
          </div>
          <div>
            <p className="text-sm font-medium text-brand-800 block mb-1.5">Services <span className="text-[#6b6b80] font-normal">(select one or more)</span></p>
            <div className="space-y-1.5 max-h-48 overflow-y-auto rounded-xl border border-[#e8e6e0] p-1">
              {services.map(s => {
                const selected = form.serviceIds.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, serviceIds: selected ? f.serviceIds.filter(id => id !== s.id) : [...f.serviceIds, s.id] }))}
                    className={cn("w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all", selected ? "bg-accent/10 border border-accent/30" : "hover:bg-[#f8f7f4] border border-transparent")}
                  >
                    <div className={cn("w-4 h-4 rounded flex items-center justify-center border-2 flex-shrink-0 transition-all", selected ? "bg-accent border-accent" : "border-[#d1d1d8]")}>
                      {selected && <Check size={10} className="text-white" />}
                    </div>
                    <span className="flex-1 text-sm font-medium">{s.name}</span>
                    <span className="flex items-center gap-1 text-xs text-[#6b6b80]"><Clock size={10} />{s.duration}m</span>
                    <span className="text-xs font-semibold text-accent">{formatPrice(s.price)}</span>
                  </button>
                );
              })}
            </div>
            {form.serviceIds.length > 1 && (() => {
              const sel = services.filter(s => form.serviceIds.includes(s.id));
              return (
                <div className="mt-2 flex items-center gap-3 text-xs text-[#6b6b80] bg-[#f8f7f4] rounded-lg px-3 py-2">
                  <span className="font-semibold text-[#0f0f1a]">{form.serviceIds.length} services</span>
                  <span className="flex items-center gap-1"><Clock size={10} />{sel.reduce((s, v) => s + v.duration, 0)} min</span>
                  <span className="flex items-center gap-1 text-accent font-semibold"><DollarSign size={10} />{formatPrice(sel.reduce((s, v) => s + v.price, 0))}</span>
                </div>
              );
            })()}
          </div>
          <Select label="Staff member" value={form.staffId} onChange={e => setForm({ ...form, staffId: e.target.value })}
            options={[{ value: "", label: "Any available" }, ...staff.map(s => ({ value: s.id, label: s.name }))]} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Date" type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
            <Input label="Time" type="time" value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} />
          </div>
          <Input label="Notes (optional)" placeholder="Any notes..." value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={() => setShowModal(false)} className="flex-1 justify-center">Cancel</Button>
            <Button onClick={submit} disabled={loading || !form.clientName || !form.clientEmail || form.serviceIds.length === 0} className="flex-1 justify-center">
              {loading ? "Saving..." : "Book Appointment"}
            </Button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
}
