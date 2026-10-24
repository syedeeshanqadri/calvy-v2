"use client";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { NewAppointmentModal, AppointmentDetailModal, type ApptDetail, type ServiceOption, type StaffOption } from "@/components/dashboard/AppointmentModals";
import { StatusBadge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { formatTime } from "@/lib/utils";
import { useTerms } from "@/components/providers/TermsProvider";
import { useCurrency } from "@/components/providers/CurrencyProvider";
import { Search, Filter, Download, Plus, CalendarX } from "lucide-react";
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

type Row = ApptDetail;

export function AppointmentsClient({ appointments, services, staff, csvExport = false }: { appointments: Row[]; services: ServiceOption[]; staff: StaffOption[]; csvExport?: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useTerms();
  const apptN = t("appointment", { plural: true });
  const ApptN = t("appointment", { plural: true, cap: true });
  const Stf1 = "Staff";
  const { formatPrice } = useCurrency();
  const [activeTab, setActiveTab] = useState("All");
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [viewAppt, setViewAppt] = useState<Row | null>(null);
  const [showFilter, setShowFilter] = useState(false);
  const [filterStaff, setFilterStaff] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setShowModal(true);
      router.replace("/dashboard/appointments");
    }
  }, [searchParams, router]);

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

  // The server builds the CSV (and checks the plan); it gets the same filters as the list.
  const exportHref = (() => {
    const qs = new URLSearchParams();
    const status = TABS.find((t) => t.label === activeTab)?.status;
    const staffId = staff.find((m) => m.name === filterStaff)?.id;
    if (status) qs.set("status", status);
    if (staffId) qs.set("staffId", staffId);
    if (filterDateFrom) qs.set("from", filterDateFrom);
    if (filterDateTo) qs.set("to", filterDateTo);
    if (search.trim()) qs.set("q", search.trim());
    return `/api/appointments/export?${qs}`;
  })();

  return (
    <DashboardLayout title={ApptN} subtitle={`${appointments.length} total ${apptN}`}>
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
              <input aria-label={`Search ${apptN}`} className="w-full sm:w-52 h-9 pl-9 pr-4 rounded-xl bg-[#f8f7f4] text-sm outline-none border border-transparent focus:border-accent/30 focus:bg-white transition-all" placeholder={`Search ${apptN}...`} value={search} onChange={(e) => setSearch(e.target.value)} />
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
                    <label htmlFor="appt-staff-member" className="text-xs font-medium text-[#6b6b80] block mb-1">{Stf1}</label>
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
              <a
                href={exportHref}
                download
                className="h-9 px-3 rounded-xl border border-[#e8e6e0] bg-white text-[#6b6b80] hover:text-brand-800 flex items-center gap-2 text-sm transition-colors"
                title="Download CSV"
                aria-label="Download CSV"
              >
                <Download size={14} />
              </a>
            )}
            <Button size="sm" className="gap-1.5" onClick={() => setShowModal(true)}><Plus size={14} /> New</Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#fafaf8] border-b border-[#f0ede8]">
                {[t("client", { cap: true }), t("service", { cap: true }), Stf1, "Date & Time", "Duration", "Price", "Status", "Payment", ""].map((h) => (
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
                    <button onClick={() => setViewAppt(appt)} className="text-xs text-accent hover:underline font-medium">Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="text-center py-16 text-[#6b6b80]">
              <CalendarX size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No {apptN} found</p>
            </div>
          )}
        </div>
      </Card>

      <AppointmentDetailModal appt={viewAppt} onClose={() => setViewAppt(null)} staff={staff} onChanged={() => router.refresh()} />
      <NewAppointmentModal isOpen={showModal} onClose={() => setShowModal(false)} services={services} staff={staff} onCreated={() => router.refresh()} />
    </DashboardLayout>
  );
}
