"use client";
import { useState } from "react";

const input = "h-10 w-28 rounded-xl border border-[#e8e6e0] px-3 text-sm bg-white";

export default function LimitsForm({ initial, defaults }: { initial: { maxUpcomingPerBusiness: number; maxNewPer24h: number }; defaults: { maxUpcomingPerBusiness: number; maxNewPer24h: number } }) {
  const [upcoming, setUpcoming] = useState(String(initial.maxUpcomingPerBusiness));
  const [new24, setNew24] = useState(String(initial.maxNewPer24h));
  const [reason, setReason] = useState("");
  const [code, setCode] = useState("");
  const [needCode, setNeedCode] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true); setError(""); setMsg("");
    const r = await fetch("/api/admin/settings/limits", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ maxUpcomingPerBusiness: upcoming, maxNewPer24h: new24, reason }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.status === 428) { setNeedCode(true); return; }
    if (!r.ok) { setError(d.error ?? "Could not save."); return; }
    setMsg("Saved.");
  }
  async function confirmCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const r = await fetch("/api/admin/2fa/reauth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
    setBusy(false);
    if (!r.ok) { setError((await r.json().catch(() => ({}))).error ?? "That code is not right."); return; }
    setNeedCode(false); setCode("");
    await save();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-4">
        <label className="text-xs text-[#6b6b80]">Most upcoming bookings per business<input type="number" min={0} max={100} value={upcoming} onChange={(e) => setUpcoming(e.target.value)} className={`${input} block`} /><span>default {defaults.maxUpcomingPerBusiness}</span></label>
        <label className="text-xs text-[#6b6b80]">Most new bookings per business in 24 hours<input type="number" min={0} max={100} value={new24} onChange={(e) => setNew24(e.target.value)} className={`${input} block`} /><span>default {defaults.maxNewPer24h}</span></label>
      </div>
      <label className="block text-xs text-[#6b6b80]">Reason for the change (required)<input value={reason} onChange={(e) => setReason(e.target.value)} className="w-full h-10 rounded-xl border border-[#e8e6e0] px-3 text-sm bg-white" /></label>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {msg && <p role="status" className="text-sm text-green-700">{msg}</p>}
      <button type="button" onClick={save} disabled={busy || reason.trim().length < 8} className="min-h-10 px-4 rounded-xl bg-accent text-white text-sm font-semibold disabled:opacity-50">Save limits</button>
      {needCode && (
        <form onSubmit={confirmCode} className="rounded-2xl border border-amber-300 p-4 space-y-2">
          <p className="text-sm font-semibold">Enter a fresh authenticator code to continue.</p>
          <div className="flex gap-2"><input inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} className={input} aria-label="Authenticator code" /><button type="submit" disabled={busy} className="min-h-10 px-4 rounded-xl border border-[#e8e6e0] text-sm font-semibold">Confirm</button></div>
        </form>
      )}
    </div>
  );
}
