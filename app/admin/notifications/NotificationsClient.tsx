"use client";
import { useState } from "react";
import { Send, Users, Globe } from "lucide-react";

const PLAN_OPTIONS = [
  { value: "", label: "All tenants" },
  { value: "free", label: "Free plan only" },
  { value: "starter", label: "Starter only" },
  { value: "professional", label: "Professional only" },
  { value: "business", label: "Business only" },
];

export default function NotificationsClient() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("/dashboard");
  const [targetPlan, setTargetPlan] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok?: boolean; sent?: string | number; error?: string } | null>(null);

  async function send() {
    if (!title.trim() || !body.trim()) return;
    setSending(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          url: url.trim() || "/dashboard",
          targetAll: !targetPlan,
          targetPlan: targetPlan || undefined,
        }),
      });
      let data: { ok?: boolean; sent?: string | number; error?: string };
      try {
        data = await res.json();
      } catch {
        data = { error: `Server error (${res.status})` };
      }
      setResult(data);
    } catch (err) {
      setResult({ error: err instanceof Error ? err.message : "Network error" });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="max-w-xl">
      <div className="mb-6">
        <h1 className="font-syne font-bold text-xl">Send Notification</h1>
        <p className="text-sm text-[#6b6b80] mt-1">Push a notification to tenant dashboards in real-time.</p>
      </div>

      <div className="bg-white rounded-2xl border border-[#e8e6e0] p-6 space-y-5">
        {/* Target */}
        <div>
          <label className="text-xs font-semibold text-[#6b6b80] uppercase tracking-wider block mb-2">Target audience</label>
          <div className="grid grid-cols-2 gap-2">
            {PLAN_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setTargetPlan(opt.value)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                  targetPlan === opt.value
                    ? "bg-sky-50 border-sky-300 text-sky-700"
                    : "border-[#e8e6e0] text-[#6b6b80] hover:bg-[#f8f7f4]"
                }`}
              >
                {opt.value === "" ? <Globe size={14} /> : <Users size={14} />}
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Title */}
        <div>
          <label className="text-sm font-medium text-[#0f0f1a] block mb-1.5">Notification title</label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. New feature available!"
            className="w-full rounded-xl border border-[#e8e6e0] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0284c7]/20 focus:border-[#0284c7] transition-all"
          />
        </div>

        {/* Body */}
        <div>
          <label className="text-sm font-medium text-[#0f0f1a] block mb-1.5">Message</label>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={3}
            placeholder="e.g. We've added calendar sync. Check it out in your dashboard."
            className="w-full rounded-xl border border-[#e8e6e0] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0284c7]/20 focus:border-[#0284c7] transition-all resize-none"
          />
        </div>

        {/* URL */}
        <div>
          <label className="text-sm font-medium text-[#0f0f1a] block mb-1.5">Deep link URL <span className="text-[#6b6b80] font-normal">(optional)</span></label>
          <input
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="/dashboard"
            className="w-full rounded-xl border border-[#e8e6e0] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0284c7]/20 focus:border-[#0284c7] transition-all"
          />
        </div>

        {result?.error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{result.error}</p>
        )}
        {result?.ok && (
          <p className="text-sm text-green-700 bg-green-50 rounded-xl px-4 py-3">
            ✓ Sent to {typeof result.sent === "number" ? `${result.sent} businesses` : "all tenants"}
          </p>
        )}

        <button
          onClick={send}
          disabled={sending || !title.trim() || !body.trim()}
          className="flex items-center gap-2 px-5 py-2.5 bg-accent text-white text-sm font-semibold rounded-xl hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Send size={15} />
          {sending ? "Sending…" : "Send notification"}
        </button>
      </div>
    </div>
  );
}
