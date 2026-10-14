"use client";
import { useState } from "react";
import { Plus, X, Send, MessageCircle, Clock, ChevronRight } from "lucide-react";

type TicketStatus = "open" | "in_progress" | "resolved" | "closed";
type Priority = "low" | "normal" | "high" | "urgent";

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

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

export function SupportClient({ tickets: initialTickets }: Props) {
  const [tickets, setTickets] = useState<Ticket[]>(initialTickets);
  const [showNew, setShowNew] = useState(false);
  const [activeTicket, setActiveTicket] = useState<TicketWithMessages | null>(null);
  const [loadingTicket, setLoadingTicket] = useState(false);

  // New ticket form
  const [subject, setSubject] = useState("");
  const [priority, setPriority] = useState<Priority>("normal");
  const [body, setBody] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  // Reply
  const [replyBody, setReplyBody] = useState("");
  const [replying, setReplying] = useState(false);

  async function openTicket(id: string) {
    setLoadingTicket(true);
    try {
      const res = await fetch(`/api/support/${id}`);
      if (res.ok) {
        const data = await res.json();
        setActiveTicket(data);
      }
    } finally {
      setLoadingTicket(false);
    }
  }

  async function createTicket() {
    if (!subject.trim() || !body.trim()) {
      setCreateError("Subject and message are required");
      return;
    }
    setCreating(true);
    setCreateError("");
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body, priority }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create ticket");
      setTickets(prev => [{ ...data, _count: { messages: data.messages?.length ?? 1 } }, ...prev]);
      setShowNew(false);
      setSubject("");
      setBody("");
      setPriority("normal");
    } catch (e) {
      setCreateError((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function sendReply() {
    if (!replyBody.trim() || !activeTicket) return;
    setReplying(true);
    try {
      const res = await fetch(`/api/support/${activeTicket.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: replyBody }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send reply");
      setActiveTicket(prev => prev ? { ...prev, messages: [...prev.messages, data] } : prev);
      setTickets(prev => prev.map(t => t.id === activeTicket.id ? { ...t, _count: { messages: t._count.messages + 1 }, updatedAt: new Date().toISOString() } : t));
      setReplyBody("");
    } finally {
      setReplying(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[#6b6b80] text-sm mt-1">Have a question or issue? Reach out and we&apos;ll get back to you.</p>
        </div>
        <button
          onClick={() => { setShowNew(true); setCreateError(""); }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0284c7] text-white text-sm font-semibold hover:bg-[#0369a1] transition-colors"
        >
          <Plus size={16} />
          New ticket
        </button>
      </div>

      {/* Ticket list */}
      {tickets.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#e8e6e0] p-12 text-center">
          <MessageCircle size={40} className="mx-auto mb-3 text-[#c5c3bf]" />
          <p className="font-syne font-bold text-[#0f0f1a] text-lg mb-1">No support tickets yet</p>
          <p className="text-[#6b6b80] text-sm">Create a ticket and we&apos;ll help you out.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-[#e8e6e0] overflow-hidden">
          <div className="divide-y divide-[#f0ede8]">
            {tickets.map(ticket => (
              <button
                key={ticket.id}
                onClick={() => openTicket(ticket.id)}
                className="w-full flex items-center gap-4 px-6 py-4 hover:bg-[#f8f7f4] transition-colors text-left"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-medium text-sm text-[#0f0f1a] truncate">{ticket.subject}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
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
                      <Clock size={10} /> {formatDate(ticket.createdAt)}
                    </span>
                  </div>
                </div>
                <ChevronRight size={16} className="text-[#c5c3bf] flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* New ticket modal */}
      {showNew && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowNew(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#f0ede8]">
              <h2 className="font-syne font-bold text-lg">New Support Ticket</h2>
              <button onClick={() => setShowNew(false)} className="w-8 h-8 rounded-xl hover:bg-[#f8f7f4] flex items-center justify-center text-[#6b6b80] transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-sm font-medium block mb-1.5">Subject</label>
                <input
                  className="w-full rounded-xl border border-[#e8e6e0] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0284c7]/20 focus:border-[#0284c7] transition-all"
                  placeholder="Briefly describe your issue"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1.5">Priority</label>
                <select
                  className="w-full rounded-xl border border-[#e8e6e0] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0284c7]/20 focus:border-[#0284c7] transition-all"
                  value={priority}
                  onChange={e => setPriority(e.target.value as Priority)}
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1.5">Message</label>
                <textarea
                  className="w-full rounded-xl border border-[#e8e6e0] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0284c7]/20 focus:border-[#0284c7] transition-all resize-none"
                  rows={5}
                  placeholder="Describe your issue in detail..."
                  value={body}
                  onChange={e => setBody(e.target.value)}
                />
              </div>
              {createError && <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-2">{createError}</p>}
              <div className="flex gap-3">
                <button onClick={() => setShowNew(false)} className="flex-1 py-2.5 rounded-xl border border-[#e8e6e0] text-sm font-medium hover:bg-[#f8f7f4] transition-colors">
                  Cancel
                </button>
                <button onClick={createTicket} disabled={creating} className="flex-1 py-2.5 rounded-xl bg-[#0284c7] text-white text-sm font-semibold hover:bg-[#0369a1] disabled:opacity-60 transition-colors">
                  {creating ? "Creating…" : "Submit ticket"}
                </button>
              </div>
            </div>
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
                  <div>
                    <h2 className="font-syne font-bold text-base">{activeTicket.subject}</h2>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_STYLES[activeTicket.status] ?? "bg-gray-100 text-gray-500"}`}>
                        {STATUS_LABELS[activeTicket.status] ?? activeTicket.status}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${PRIORITY_STYLES[activeTicket.priority] ?? "bg-gray-100 text-gray-500"}`}>
                        {activeTicket.priority}
                      </span>
                      <span className="text-[10px] text-[#6b6b80]">{formatDate(activeTicket.createdAt)}</span>
                    </div>
                  </div>
                  <button onClick={() => setActiveTicket(null)} className="w-8 h-8 rounded-xl hover:bg-[#f8f7f4] flex items-center justify-center text-[#6b6b80] transition-colors flex-shrink-0">
                    <X size={16} />
                  </button>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4 min-h-0">
                  {activeTicket.messages.map(msg => (
                    <div key={msg.id} className={`flex ${msg.senderRole === "tenant" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${msg.senderRole === "tenant" ? "bg-[#0284c7] text-white rounded-br-sm" : "bg-[#f8f7f4] text-[#0f0f1a] rounded-bl-sm"}`}>
                        <p className="text-sm leading-relaxed">{msg.body}</p>
                        <p className={`text-[10px] mt-1.5 ${msg.senderRole === "tenant" ? "text-sky-200" : "text-[#6b6b80]"}`}>
                          {msg.senderRole === "admin" ? "Support Team · " : ""}{formatTime(msg.createdAt)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Reply */}
                {activeTicket.status !== "closed" && activeTicket.status !== "resolved" && (
                  <div className="flex-shrink-0 border-t border-[#f0ede8] p-4">
                    <div className="flex gap-3 items-end">
                      <textarea
                        className="flex-1 rounded-xl border border-[#e8e6e0] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0284c7]/20 focus:border-[#0284c7] transition-all resize-none"
                        rows={2}
                        placeholder="Write a reply..."
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
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
