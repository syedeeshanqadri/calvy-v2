"use client";
import { useState } from "react";
import Link from "next/link";
import { Users, Mail, Phone, X, Trash2, ExternalLink, Clock } from "lucide-react";

interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  businessType: string | null;
  demoRequested: boolean;
  message: string | null;
  status: string;
  source: string;
  notes: string | null;
  createdAt: string;
}

const STAGES: { id: string; label: string; color: string }[] = [
  { id: "new", label: "New", color: "#0284c7" },
  { id: "contacted", label: "Contacted", color: "#8b5cf6" },
  { id: "qualified", label: "Qualified", color: "#f59e0b" },
  { id: "demo", label: "Demo", color: "#ec4899" },
  { id: "won", label: "Won", color: "#22c55e" },
  { id: "lost", label: "Lost", color: "#94a3b8" },
];

function timeAgo(iso: string) {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 3600) return `${Math.max(1, Math.floor(d / 60))}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

export function CrmBoard({ initialLeads }: { initialLeads: Lead[] }) {
  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const [active, setActive] = useState<Lead | null>(null);
  const [savingNotes, setSavingNotes] = useState(false);

  async function patch(id: string, data: Partial<Lead>) {
    setLeads(ls => ls.map(l => (l.id === id ? { ...l, ...data } : l)));
    setActive(a => (a && a.id === id ? { ...a, ...data } : a));
    await fetch(`/api/crm/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  }

  async function remove(id: string) {
    if (!confirm("Delete this lead? This can't be undone.")) return;
    setLeads(ls => ls.filter(l => l.id !== id));
    setActive(null);
    await fetch(`/api/crm/leads/${id}`, { method: "DELETE" });
  }

  const counts = Object.fromEntries(STAGES.map(s => [s.id, leads.filter(l => l.status === s.id).length]));

  return (
    <div className="min-h-screen bg-[#f8f7f4]">
      {/* Top bar */}
      <header className="bg-white border-b border-[#e8e6e0] px-5 sm:px-8 py-4 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-2.5">
          <Users size={22} className="text-sky-600" />
          <div>
            <h1 className="font-syne font-bold text-lg leading-none">CRM Pipeline</h1>
            <p className="text-xs text-[#6b6b80] mt-0.5">{leads.length} total leads</p>
          </div>
        </div>
        <Link href="/admin" className="text-sm text-[#6b6b80] hover:text-sky-600 font-medium">Admin →</Link>
      </header>

      {/* Board */}
      <div className="overflow-x-auto p-5 sm:p-6">
        <div className="flex gap-4 min-w-max">
          {STAGES.map(stage => (
            <div key={stage.id} className="w-72 flex-shrink-0">
              <div className="flex items-center gap-2 mb-3 px-1">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: stage.color }} />
                <span className="text-sm font-semibold text-[#0f0f1a]">{stage.label}</span>
                <span className="text-xs text-[#9b9b9b] bg-gray-100 rounded-full px-2 py-0.5">{counts[stage.id]}</span>
              </div>
              <div className="space-y-2.5">
                {leads.filter(l => l.status === stage.id).map(lead => (
                  <button
                    key={lead.id}
                    onClick={() => setActive(lead)}
                    className="w-full text-left bg-white rounded-2xl border border-[#e8e6e0] p-4 hover:shadow-md hover:border-sky-200 transition-all"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-sm text-[#0f0f1a] truncate">{lead.name}</span>
                      {lead.demoRequested && <span className="text-[9px] font-bold text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded-full flex-shrink-0">DEMO</span>}
                    </div>
                    <p className="text-xs text-[#6b6b80] truncate mt-1">{lead.email}</p>
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      <span className="text-[9px] font-medium text-sky-700 bg-sky-50 rounded px-1.5 py-0.5">{lead.source}</span>
                      {lead.businessType && <span className="text-[9px] text-[#9b9b9b] capitalize">{lead.businessType}</span>}
                      <span className="text-[10px] text-[#c5c3bf] flex items-center gap-1 ml-auto"><Clock size={9} />{timeAgo(lead.createdAt)}</span>
                    </div>
                  </button>
                ))}
                {counts[stage.id] === 0 && <div className="text-xs text-[#c5c3bf] text-center py-6 border border-dashed border-[#e8e6e0] rounded-2xl">No leads</div>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Detail panel */}
      {active && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setActive(null)} />
          <div className="relative w-full max-w-md bg-white h-full shadow-2xl overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#e8e6e0] sticky top-0 bg-white">
              <h2 className="font-syne font-bold text-lg">{active.name}</h2>
              <button onClick={() => setActive(null)} className="text-[#6b6b80] hover:text-[#0f0f1a]"><X size={20} /></button>
            </div>

            <div className="p-6 space-y-5">
              {active.demoRequested && (
                <div className="inline-flex items-center gap-1.5 text-xs font-bold text-sky-700 bg-sky-50 px-3 py-1.5 rounded-full">Demo requested</div>
              )}

              <div className="space-y-2.5">
                <a href={`mailto:${active.email}`} className="flex items-center gap-3 text-sm text-[#3d3d4d] hover:text-sky-600">
                  <Mail size={16} className="text-[#9b9b9b]" /> {active.email}
                </a>
                {active.phone && (
                  <a href={`tel:${active.phone}`} className="flex items-center gap-3 text-sm text-[#3d3d4d] hover:text-sky-600">
                    <Phone size={16} className="text-[#9b9b9b]" /> {active.phone}
                  </a>
                )}
                {active.businessType && <p className="text-sm text-[#6b6b80] capitalize">Business: {active.businessType}</p>}
                <p className="text-xs text-[#9b9b9b]">Captured {timeAgo(active.createdAt)} · via {active.source}</p>
              </div>

              {active.message && (
                <div className="bg-[#f8f7f4] rounded-xl p-3 text-sm text-[#3d3d4d]">{active.message}</div>
              )}

              <div>
                <label className="block text-sm font-medium text-[#374151] mb-1.5">Pipeline stage</label>
                <select
                  value={active.status}
                  onChange={e => patch(active.id, { status: e.target.value })}
                  className="w-full h-11 rounded-xl border border-[#e8e6e0] bg-white px-4 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                >
                  {STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#374151] mb-1.5">Notes</label>
                <textarea
                  defaultValue={active.notes ?? ""}
                  rows={5}
                  onBlur={async (e) => { setSavingNotes(true); await patch(active.id, { notes: e.target.value }); setSavingNotes(false); }}
                  placeholder="Add internal notes about this lead…"
                  className="w-full rounded-xl border border-[#e8e6e0] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                />
                {savingNotes && <p className="text-[11px] text-[#9b9b9b] mt-1">Saving…</p>}
              </div>

              <div className="flex items-center justify-between pt-2">
                <a href={`mailto:${active.email}`} className="inline-flex items-center gap-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl">
                  <Mail size={15} /> Email lead
                </a>
                <button onClick={() => remove(active.id)} className="inline-flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700">
                  <Trash2 size={15} /> Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
