"use client";
import { useState } from "react";
import { Mail, MessageCircle, Send, Clock, Users, Layers } from "lucide-react";
import { cn } from "@/lib/utils";

type Medium = "email" | "whatsapp" | "both";

interface BroadcastRecord {
  id: string;
  subject: string | null;
  message: string;
  medium: string;
  sentTo: number;
  createdAt: Date;
}

interface Props {
  clientCount: number;
  emailCount: number;
  whatsappCount: number;
  recentBroadcasts: BroadcastRecord[];
}

const MEDIUM_OPTIONS: { value: Medium; label: string; icon: React.ElementType; desc: string }[] = [
  { value: "email", label: "Email", icon: Mail, desc: "Send to clients with email" },
  { value: "whatsapp", label: "WhatsApp", icon: MessageCircle, desc: "Send to clients with phone" },
  { value: "both", label: "Both", icon: Layers, desc: "Email + WhatsApp" },
];

function mediumIcon(medium: string) {
  if (medium === "email") return <Mail size={13} />;
  if (medium === "whatsapp") return <MessageCircle size={13} />;
  return <Layers size={13} />;
}

function timeAgo(date: Date) {
  const secs = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

export default function BroadcastsClient({ clientCount, emailCount, whatsappCount, recentBroadcasts }: Props) {
  const [medium, setMedium] = useState<Medium>("email");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok?: boolean; sentTo?: number; error?: string } | null>(null);
  const [history, setHistory] = useState<BroadcastRecord[]>(recentBroadcasts);

  const recipientCount = medium === "email" ? emailCount : medium === "whatsapp" ? whatsappCount : Math.max(emailCount, whatsappCount);
  const canSend = message.trim().length > 0 && (medium === "whatsapp" || subject.trim().length > 0);

  async function handleSend() {
    if (!canSend || sending) return;
    setSending(true);
    setResult(null);
    try {
      const res = await fetch("/api/broadcasts/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: subject.trim() || undefined, message: message.trim(), medium }),
      });
      const data = await res.json();
      if (data.ok) {
        setResult({ ok: true, sentTo: data.sentTo });
        setHistory(prev => [{
          id: Date.now().toString(),
          subject: subject.trim() || null,
          message: message.trim(),
          medium,
          sentTo: data.sentTo,
          createdAt: new Date(),
        }, ...prev]);
        setSubject("");
        setMessage("");
      } else {
        setResult({ error: data.error ?? "Failed to send" });
      }
    } catch {
      setResult({ error: "Network error" });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total clients", value: clientCount, icon: Users },
          { label: "Have email", value: emailCount, icon: Mail },
          { label: "Have WhatsApp", value: whatsappCount, icon: MessageCircle },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="bg-white rounded-2xl border border-[#e8e6e0] p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-sky-50 flex items-center justify-center text-[#0284c7] flex-shrink-0">
              <Icon size={16} />
            </div>
            <div className="min-w-0">
              <p className="font-syne font-bold text-lg leading-tight">{value}</p>
              <p className="text-[#6b6b80] text-xs truncate">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Compose card */}
      <div className="bg-white rounded-2xl border border-[#e8e6e0] p-6 space-y-5">
        <div>
          <h2 className="font-syne font-bold text-base text-[#0f0f1a]">Compose broadcast</h2>
          <p className="text-sm text-[#6b6b80] mt-0.5">Send an offer, reminder, or update to your clients.</p>
        </div>

        {/* Medium selector */}
        <div>
          <label className="text-xs font-semibold text-[#6b6b80] uppercase tracking-wider block mb-2">Send via</label>
          <div className="grid grid-cols-3 gap-2">
            {MEDIUM_OPTIONS.map(opt => {
              const Icon = opt.icon;
              return (
                <button
                  key={opt.value}
                  onClick={() => setMedium(opt.value)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border text-sm font-medium transition-all",
                    medium === opt.value
                      ? "bg-sky-50 border-sky-300 text-sky-700"
                      : "border-[#e8e6e0] text-[#6b6b80] hover:bg-[#f8f7f4]"
                  )}
                >
                  <Icon size={18} />
                  <span className="text-xs font-semibold">{opt.label}</span>
                  <span className="text-[10px] text-center leading-tight opacity-70">{opt.desc}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Subject — email only */}
        {(medium === "email" || medium === "both") && (
          <div>
            <label className="text-sm font-medium text-[#0f0f1a] block mb-1.5">Subject</label>
            <input
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="e.g. Special offer just for you!"
              className="w-full rounded-xl border border-[#e8e6e0] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0284c7]/20 focus:border-[#0284c7] transition-all"
            />
          </div>
        )}

        {/* Message */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-medium text-[#0f0f1a]">Message</label>
            <span className={cn("text-xs", message.length > 1500 ? "text-red-500" : "text-[#6b6b80]")}>
              {message.length}/1600
            </span>
          </div>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            rows={5}
            maxLength={1600}
            placeholder="Hi! We have an exclusive offer for you this week…"
            className="w-full rounded-xl border border-[#e8e6e0] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0284c7]/20 focus:border-[#0284c7] transition-all resize-none"
          />
        </div>

        {/* Recipient preview */}
        <div className="flex items-center gap-2 px-4 py-3 bg-[#f8f7f4] rounded-xl">
          <Users size={14} className="text-[#6b6b80] flex-shrink-0" />
          <p className="text-sm text-[#3d3d4d]">
            Will be sent to <strong className="text-[#0f0f1a]">{recipientCount} {recipientCount === 1 ? "client" : "clients"}</strong>
          </p>
        </div>

        {result?.error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{result.error}</p>
        )}
        {result?.ok && (
          <p className="text-sm text-green-700 bg-green-50 rounded-xl px-4 py-3">
            ✓ Sent to {result.sentTo} {result.sentTo === 1 ? "client" : "clients"} successfully
          </p>
        )}

        <button
          onClick={handleSend}
          disabled={!canSend || sending}
          className="flex items-center gap-2 px-5 py-2.5 bg-accent text-white text-sm font-semibold rounded-xl hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Send size={15} />
          {sending ? "Sending…" : `Send broadcast`}
        </button>
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="bg-white rounded-2xl border border-[#e8e6e0] overflow-hidden">
          <div className="px-6 py-4 border-b border-[#f0ede8]">
            <h2 className="font-syne font-semibold text-[15px] text-[#0f0f1a]">Recent broadcasts</h2>
          </div>
          <div className="divide-y divide-[#f5f3ef]">
            {history.slice(0, 10).map(b => (
              <div key={b.id} className="px-6 py-4 flex items-start gap-4">
                <div className="w-8 h-8 rounded-lg bg-sky-50 flex items-center justify-center text-[#0284c7] flex-shrink-0 mt-0.5">
                  {mediumIcon(b.medium)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#0f0f1a] truncate">{b.subject ?? b.message.slice(0, 60)}</p>
                  {b.subject && (
                    <p className="text-xs text-[#6b6b80] truncate mt-0.5">{b.message.slice(0, 80)}</p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs font-semibold text-[#0284c7]">{b.sentTo} sent</p>
                  <p className="text-[11px] text-[#6b6b80] mt-0.5 flex items-center gap-1 justify-end">
                    <Clock size={10} />
                    {timeAgo(b.createdAt)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
