"use client";
import { useState } from "react";
import { X, Send, MessageCircle, Clock, Building2, ChevronRight } from "lucide-react";

type FilterTab = "all" | "open" | "in_progress" | "resolved" | "closed";

interface SupportMessage {
  id: string;
  ticketId: string;
  senderRole: string;
  body: string;
  createdAt: string;
}

interface Ticket {
  id: string;
  subject: string;
  status: string;
  priority: string;
  createdAt: string;
  updatedAt: string;
  business: {
    name: string;
    owner: { email: string; name: string };
  };
  _count: { messages: number };
}

interface TicketWithMessages extends Ticket {
  messages: SupportMessage[];
}

interface Props {
  tickets: Ticket[];
}

const STATUS_STYLES: Record<string, string> = {
  open: "bg-blue-50 text-blue-700",
  in_progress: "bg-amber-50 text-amber-700",
  resolved: "bg-green-50 text-green-700",
  closed: "bg-gray-100 text-gray-500",
};

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
  closed: "Closed",
};

const PRIORITY_STYLES: Record<string, string> = {
  low: "bg-gray-100 text-gray-500",
  normal: "bg-sky-50 text-sky-600",
  high: "bg-orange-50 text-orange-600",
  urgent: "bg-red-50 text-red-600",
};

const TABS: { key: FilterTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "in_progress", label: "In Progress" },
  { key: "resolved", label: "Resolved" },
  { key: "closed", label: "Closed" },
];

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

export function AdminSupportClient({ tickets: initialTickets }: Props) {
  const [tickets, setTickets] = useState<Ticket[]>(initialTickets);
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [activeTicket, setActiveTicket] = useState<TicketWithMessages | null>(null);
  const [loadingTicket, setLoadingTicket] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [replying, setReplying] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const filtered = activeTab === "all" ? tickets : tickets.filter(t => t.status === activeTab);

  async function openTicket(id: string) {
    setLoadingTicket(true);
    try {
      const res = await fetch(`/api/admin/support/${id}`);
      if (res.ok) {
        const data = await res.json();
        setActiveTicket(data);
        setReplyBody("");
      }
    } finally {
      setLoadingTicket(false);
    }
  }

  async function sendReply() {
    if (!replyBody.trim() || !activeTicket) return;
    setReplying(true);
    try {
      const res = await fetch(`/api/admin/support/${activeTicket.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: replyBody }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send reply");
      // If ticket was open, it's now in_progress
      const newStatus = activeTicket.status === "open" ? "in_progress" : activeTicket.status;
      setActiveTicket(prev => prev ? { ...prev, messages: [...prev.messages, data], status: newStatus } : prev);
      setTickets(prev => prev.map(t => t.id === activeTicket.id ? { ...t, _count: { messages: t._count.messages + 1 }, updatedAt: new Date().toISOString(), status: newStatus } : t));
      setReplyBody("");
    } finally {
      setReplying(false);
    }
  }

  async function updateStatus(status: string) {
    if (!activeTicket) return;
    setUpdatingStatus(true);
    try {
      const res = await fetch(`/api/admin/support/${activeTicket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update status");
      setActiveTicket(prev => prev ? { ...prev, status } : prev);
      setTickets(prev => prev.map(t => t.id === activeTicket.id ? { ...t, status, updatedAt: new Date().toISOString() } : t));
    } finally {
      setUpdatingStatus(false);
    }
  }

  const tabCounts: Record<FilterTab, number> = {
    all: tickets.length,
    open: tickets.filter(t => t.status === "open").length,
    in_progress: tickets.filter(t => t.status === "in_progress").length,
    resolved: tickets.filter(t => t.status === "resolved").length,
    closed: tickets.filter(t => t.status === "closed").length,
  };

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="font-syne font-bold text-2xl">Support Tickets</h1>
        <p className="text-[#6b6b80] text-sm mt-1">Manage and respond to tenant support requests</p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-[#f8f7f4] rounded-xl p-1 w-fit border border-[#e8e6e0]">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${activeTab === tab.key ? "bg-white text-[#0f0f1a] shadow-sm" : "text-[#6b6b80] hover:text-[#0f0f1a]"}`}
          >
            {tab.label}
            {tabCounts[tab.key] > 0 && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${activeTab === tab.key ? "bg-[#f8f7f4] text-[#6b6b80]" : "bg-[#e8e6e0] text-[#6b6b80]"}`}>
                {tabCounts[tab.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Ticket list */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#e8e6e0] p-12 text-center">
          <MessageCircle size={40} className="mx-auto mb-3 text-[#c5c3bf]" />
          <p className="font-syne font-bold text-[#0f0f1a] text-lg mb-1">No tickets</p>
          <p className="text-[#6b6b80] text-sm">No support tickets in this category.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-[#e8e6e0] overflow-hidden">
          <div className="divide-y divide-[#f0ede8]">
            {filtered.map(ticket => (
              <button
                key={ticket.id}
                onClick={() => openTicket(ticket.id)}
                className="w-full flex items-center gap-4 px-6 py-4 hover:bg-[#f8f7f4] transition-colors text-left"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <p className="font-medium text-sm text-[#0f0f1a]">{ticket.subject}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="flex items-center gap-1 text-[#6b6b80] text-xs">
                      <Building2 size={11} /> {ticket.business.name}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_STYLES[ticket.status] ?? "bg-gray-100 text-gray-500"}`}>
                      {STATUS_LABELS[ticket.status] ?? ticket.status}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${PRIORITY_STYLES[ticket.priority] ?? "bg-gray-100 text-gray-500"}`}>
                      {ticket.priority}
                    </span>
                    <span className="text-[10px] text-[#6b6b80] flex items-center gap-1">
                      <MessageCircle size={10} /> {ticket._count.messages}
                    </span>
                    <span className="text-[10px] text-[#6b6b80] flex items-center gap-1">
                      <Clock size={10} /> {formatDate(ticket.updatedAt)}
                    </span>
                  </div>
                </div>
                <ChevronRight size={16} className="text-[#c5c3bf] flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Ticket detail panel */}
      {(activeTicket || loadingTicket) && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setActiveTicket(null)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            {loadingTicket ? (
              <div className="flex items-center justify-center p-16">
                <div className="w-8 h-8 border-2 border-[#0284c7] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : activeTicket && (
              <>
                <div className="flex items-start justify-between px-6 py-4 border-b border-[#f0ede8] flex-shrink-0">
                  <div className="min-w-0 flex-1 pr-4">
                    <h2 className="font-syne font-bold text-base">{activeTicket.subject}</h2>
                    <p className="text-xs text-[#6b6b80] mt-0.5">
                      {activeTicket.business.name} · {activeTicket.business.owner.email}
                    </p>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${PRIORITY_STYLES[activeTicket.priority] ?? "bg-gray-100 text-gray-500"}`}>
                        {activeTicket.priority}
                      </span>
                      <span className="text-xs text-[#6b6b80]">{formatDate(activeTicket.createdAt)}</span>
                      {/* Status dropdown */}
                      <select
                        value={activeTicket.status}
                        onChange={e => updateStatus(e.target.value)}
                        disabled={updatingStatus}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border-0 focus:outline-none cursor-pointer ${STATUS_STYLES[activeTicket.status] ?? "bg-gray-100 text-gray-500"}`}
                      >
                        <option value="open">Open</option>
                        <option value="in_progress">In Progress</option>
                        <option value="resolved">Resolved</option>
                        <option value="closed">Closed</option>
                      </select>
                    </div>
                  </div>
                  <button onClick={() => setActiveTicket(null)} className="w-8 h-8 rounded-xl hover:bg-[#f8f7f4] flex items-center justify-center text-[#6b6b80] transition-colors flex-shrink-0">
                    <X size={16} />
                  </button>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4 min-h-0">
                  {activeTicket.messages.map(msg => (
                    <div key={msg.id} className={`flex ${msg.senderRole === "admin" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${msg.senderRole === "admin" ? "bg-[#0284c7] text-white rounded-br-sm" : "bg-[#f8f7f4] text-[#0f0f1a] rounded-bl-sm"}`}>
                        <p className="text-xs font-semibold mb-1 opacity-70">
                          {msg.senderRole === "admin" ? "You (Admin)" : activeTicket.business.name}
                        </p>
                        <p className="text-sm leading-relaxed">{msg.body}</p>
                        <p className={`text-[10px] mt-1.5 ${msg.senderRole === "admin" ? "text-sky-200" : "text-[#6b6b80]"}`}>
                          {formatTime(msg.createdAt)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Reply */}
                <div className="flex-shrink-0 border-t border-[#f0ede8] p-4">
                  <div className="flex gap-3 items-end">
                    <textarea
                      className="flex-1 rounded-xl border border-[#e8e6e0] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0284c7]/20 focus:border-[#0284c7] transition-all resize-none"
                      rows={2}
                      placeholder="Reply to this ticket..."
                      value={replyBody}
                      onChange={e => setReplyBody(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                    />
                    <button
                      onClick={sendReply}
                      disabled={replying || !replyBody.trim()}
                      className="p-3 rounded-xl bg-[#0284c7] text-white hover:bg-[#0369a1] disabled:opacity-50 transition-colors flex-shrink-0"
                    >
                      <Send size={16} />
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
