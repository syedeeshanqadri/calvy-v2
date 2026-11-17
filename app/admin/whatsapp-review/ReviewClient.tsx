"use client";
import { useState } from "react";

interface Conn { businessId: string; business: string; wabaId: string; number: string | null; source: string }
type Result = { ok: true; id: string; status: string; name: string; alreadyExisted: boolean } | { ok: false; error: string };

export default function ReviewClient({ connections }: { connections: Conn[] }) {
  const [businessId, setBusinessId] = useState(connections[0]?.businessId ?? "");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function create() {
    setBusy(true); setResult(null);
    try {
      const res = await fetch("/api/admin/whatsapp-review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessId }) });
      const json = await res.json().catch(() => ({}));
      setResult(res.ok ? (json as Result) : { ok: false, error: json.error ?? "Failed" });
    } finally { setBusy(false); }
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="font-syne font-bold text-2xl text-[#0f0f1a]">WhatsApp review template</h1>
        <p className="text-sm text-[#6b6b80] mt-1">For the Meta App Review screen recording. Creates the UTILITY template <span className="font-mono">calvy_app_review_demo</span> (English) on a connected WhatsApp Business Account through the Graph API and shows Meta&apos;s response.</p>
      </div>
      {connections.length === 0 ? (
        <p className="text-sm rounded-xl bg-amber-50 text-amber-900 px-3 py-2">No business has a CONNECTED WhatsApp connection yet. Connect one in Settings &gt; WhatsApp first.</p>
      ) : (
        <div className="bg-white rounded-2xl border border-[#e8e6e0] p-5 space-y-4">
          <label className="block text-xs font-semibold text-[#6b6b80]">Connected WhatsApp Business Account
            <select value={businessId} onChange={(e) => setBusinessId(e.target.value)} className="mt-1 w-full h-10 px-3 rounded-xl bg-white border border-[#e8e6e0] text-sm">
              {connections.map((c) => <option key={c.businessId} value={c.businessId}>{c.business} · {c.number ?? "number pending"} · WABA {c.wabaId} · {c.source === "EMBEDDED" ? "Connect WhatsApp" : "manual"}</option>)}
            </select>
          </label>
          <button type="button" onClick={create} disabled={busy || !businessId} className="h-10 px-4 rounded-xl bg-[#0f0f1a] text-white text-sm font-semibold disabled:opacity-50">{busy ? "Creating…" : "Create review template"}</button>
          {result && (result.ok ? (
            <div role="status" className="rounded-xl bg-emerald-50 text-emerald-900 text-sm px-3 py-3 space-y-1">
              <p className="font-semibold">{result.alreadyExisted ? "Template already exists on this account (Meta's current record)" : "Meta accepted the template"}</p>
              <p>Name: <span className="font-mono">{result.name}</span></p>
              <p>Template ID from Meta: <span className="font-mono">{result.id}</span></p>
              <p>Status: <span className="font-mono">{result.status}</span> (Meta then reviews it; PENDING is normal)</p>
            </div>
          ) : (
            <p role="alert" className="rounded-xl bg-red-50 text-red-700 text-sm px-3 py-2">Meta said: {result.error}</p>
          ))}
        </div>
      )}
    </div>
  );
}
