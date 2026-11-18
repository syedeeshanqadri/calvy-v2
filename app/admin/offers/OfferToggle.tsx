"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function OfferToggle({ id, enabled }: { id: string; enabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function flip() {
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/admin/offers/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: !enabled }) });
      if (!res.ok) setError("Could not change it.");
      else router.refresh();
    } catch { setError("Network error."); }
    finally { setBusy(false); }
  }
  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" onClick={flip} disabled={busy} aria-pressed={enabled}
        className={`h-9 px-4 rounded-xl text-sm font-semibold disabled:opacity-60 ${enabled ? "bg-[#e7f7ec] text-[#166534]" : "bg-[#f1f0ec] text-[#4b4b5e]"}`}>
        {busy ? "Saving…" : enabled ? "Enabled (click to disable)" : "Disabled (click to enable)"}
      </button>
      {error && <span role="alert" className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
