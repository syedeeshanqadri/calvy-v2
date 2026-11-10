"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PACK_IDS } from "@/lib/packs/types";
import { REGIONS } from "@/lib/regions";

const input = "w-full h-10 rounded-xl border border-[#e8e6e0] px-3 text-sm bg-white";

export default function CreateBusinessForm() {
  const router = useRouter();
  const [f, setF] = useState({ reason: "", ownerName: "", ownerEmail: "", businessName: "", packId: "OTHER", country: "IN", phone: "" });
  const [code, setCode] = useState("");
  const [needCode, setNeedCode] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true); setError("");
    const r = await fetch("/api/admin/businesses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.status === 428) { setNeedCode(true); return; }
    if (!r.ok) { setError(d.error ?? "Something went wrong."); return; }
    router.push(`/admin/businesses/${d.businessId}`);
  }

  async function confirmCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const r = await fetch("/api/admin/2fa/reauth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
    setBusy(false);
    if (!r.ok) { setError((await r.json().catch(() => ({}))).error ?? "That code is not right."); return; }
    setNeedCode(false); setCode("");
    await submit();
  }

  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  return (
    <div className="space-y-4">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <label className="block text-xs text-[#6b6b80]">Owner name<input value={f.ownerName} onChange={(e) => set("ownerName", e.target.value)} className={input} required /></label>
        <label className="block text-xs text-[#6b6b80]">Owner email<input type="email" value={f.ownerEmail} onChange={(e) => set("ownerEmail", e.target.value)} className={input} required /></label>
        <label className="block text-xs text-[#6b6b80]">Business name<input value={f.businessName} onChange={(e) => set("businessName", e.target.value)} className={input} required /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs text-[#6b6b80]">Business type<select value={f.packId} onChange={(e) => set("packId", e.target.value)} className={input}>{PACK_IDS.map((p) => <option key={p} value={p}>{p}</option>)}</select></label>
          <label className="block text-xs text-[#6b6b80]">Country<select value={f.country} onChange={(e) => set("country", e.target.value)} className={input}>{REGIONS.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}</select></label>
        </div>
        <label className="block text-xs text-[#6b6b80]">Phone (optional)<input type="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} className={input} /></label>
        <label className="block text-xs text-[#6b6b80]">Reason (required)<input value={f.reason} onChange={(e) => set("reason", e.target.value)} className={input} placeholder="e.g. Onboarding call with the owner" required /></label>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={busy || f.reason.trim().length < 8} className="min-h-10 px-4 rounded-xl bg-accent text-white text-sm font-semibold disabled:opacity-50">Create business</button>
      </form>
      {needCode && (
        <form onSubmit={confirmCode} className="bg-white rounded-2xl border border-amber-300 p-4 space-y-2">
          <p className="text-sm font-semibold">Enter a fresh authenticator code to continue.</p>
          <div className="flex gap-2"><input inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} className={`${input} w-40`} aria-label="Authenticator code" /><button type="submit" disabled={busy} className="min-h-10 px-4 rounded-xl border border-[#e8e6e0] text-sm font-semibold">Confirm</button></div>
        </form>
      )}
    </div>
  );
}
