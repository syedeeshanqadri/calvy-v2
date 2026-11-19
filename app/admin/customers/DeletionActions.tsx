"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeletionActions({ id, blocked }: { id: string; blocked: boolean }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function act(action: "process" | "cancel") {
    if (action === "process" && !confirm("Anonymise this customer now? This cannot be undone.")) return;
    setBusy(true); setMsg("");
    try {
      const res = await fetch(`/api/admin/customers/deletions/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, reason }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setMsg(d.error ?? "Could not do that."); else router.refresh();
    } catch { setMsg("Network error."); } finally { setBusy(false); }
  }
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-xs font-semibold text-[#4b4b5e] block flex-1 min-w-48">Reason (audited)
        <input className="h-10 w-full rounded-xl border border-[#e8e6e0] bg-white px-3 text-sm block" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
      </label>
      <button type="button" disabled={busy || blocked} onClick={() => act("process")} className="h-10 px-4 rounded-xl bg-red-600 text-white text-sm font-semibold disabled:opacity-50">Process now</button>
      <button type="button" disabled={busy} onClick={() => act("cancel")} className="h-10 px-4 rounded-xl border border-[#e8e6e0] text-sm font-semibold disabled:opacity-50">Cancel request</button>
      {msg && <span role="alert" className="text-sm text-red-600">{msg}</span>}
    </div>
  );
}
