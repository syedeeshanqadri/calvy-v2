"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { LEVELS, LEVEL_LABEL, type LevelId } from "@/lib/rewards/levels";

export function LevelAdjustForm({ q, current }: { q: string; current: LevelId }) {
  const router = useRouter();
  const [level, setLevel] = useState<LevelId>(current);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg("");
    try {
      const res = await fetch("/api/admin/rewards/adjust", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q, level, reason }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setMsg(d.error ?? "Could not change it."); else { setMsg("Saved and audited."); router.refresh(); }
    } catch { setMsg("Network error."); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2 pt-3">
      <label className="text-xs font-semibold text-[#4b4b5e] block">Set level
        <select className="h-10 rounded-xl border border-[#e8e6e0] bg-white px-3 text-sm block" value={level} onChange={(e) => setLevel(e.target.value as LevelId)}>{LEVELS.map((l) => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}</select>
      </label>
      <label className="text-xs font-semibold text-[#4b4b5e] block flex-1 min-w-48">Reason (audited)
        <input required minLength={8} maxLength={500} className="h-10 rounded-xl border border-[#e8e6e0] bg-white px-3 text-sm block w-full" value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <button type="submit" disabled={busy} className="h-10 px-4 rounded-xl bg-[#0f0f14] text-white text-sm font-semibold disabled:opacity-60">{busy ? "Saving…" : "Adjust"}</button>
      {msg && <span role="status" className="text-sm">{msg}</span>}
    </form>
  );
}
