"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  business: { id: string; name: string; phone: string; email: string; address: string; website: string; description: string; suspended: boolean; plan: string; overridePlan: string | null; overrideUntil: string | null; ownerHasPassword: boolean };
  viewAsActive: boolean;
}

const box = "bg-white rounded-2xl border border-[#e8e6e0] p-5";
const input = "w-full h-10 rounded-xl border border-[#e8e6e0] px-3 text-sm bg-white";
const btn = "min-h-10 px-4 rounded-xl text-sm font-semibold border border-[#e8e6e0] bg-white hover:bg-[#f8f7f4] disabled:opacity-50";
const danger = "min-h-10 px-4 rounded-xl text-sm font-semibold border border-red-200 text-red-700 bg-white hover:bg-red-50 disabled:opacity-50";

type Pending = { url: string; body: unknown; then?: (data: Record<string, unknown>) => void };

export function BusinessActions({ business: b, viewAsActive }: Props) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [viewReason, setViewReason] = useState("");
  const [actReason, setActReason] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null); // waiting for a fresh authenticator code
  const [code, setCode] = useState("");
  const [edit, setEdit] = useState({ name: b.name, phone: b.phone, email: b.email, address: b.address, website: b.website, description: b.description });
  const [plan, setPlan] = useState<"free" | "professional" | "business">("professional");
  const [until, setUntil] = useState("");

  async function send(p: Pending) {
    setBusy(true); setError(""); setMsg("");
    try {
      const res = await fetch(p.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p.body) });
      const data = await res.json().catch(() => ({}));
      if (res.status === 428) { setPending(p); return; }
      if (!res.ok) { setError(data.error ?? "Something went wrong."); return; }
      setPending(null); setCode("");
      if (p.then) p.then(data); else { setMsg(data.message ?? "Done."); router.refresh(); }
    } catch { setError("We could not reach the server."); }
    finally { setBusy(false); }
  }

  async function confirmCode(e: React.FormEvent) {
    e.preventDefault();
    if (!pending) return;
    setBusy(true); setError("");
    const r = await fetch("/api/admin/2fa/reauth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
    const data = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setError(data.error ?? "That code is not right."); return; }
    setCode("");
    await send(pending);
  }

  const act = (action: string, extra: Record<string, unknown> = {}) => send({ url: `/api/admin/businesses/${b.id}`, body: { action, reason, ...extra } });
  const startView = (mode: "READ" | "ACT") => send({
    url: "/api/admin/view-as", body: { businessId: b.id, mode, reason: mode === "ACT" ? actReason : viewReason },
    then: () => { router.push("/dashboard"); router.refresh(); },
  });

  return (
    <div className="space-y-6">
      {(msg || error) && <p role={error ? "alert" : "status"} className={`text-sm rounded-xl px-4 py-3 ${error ? "bg-red-50 text-red-700" : "bg-green-50 text-green-800"}`}>{error || msg}</p>}

      {pending && (
        <form onSubmit={confirmCode} className={`${box} border-amber-300 space-y-3`} aria-label="Confirm with authenticator">
          <p className="text-sm font-semibold">Enter a fresh code from your authenticator app to continue.</p>
          <div className="flex gap-2"><input inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} className={`${input} w-40`} aria-label="Authenticator code" /><button type="submit" disabled={busy || code.replace(/\s/g, "").length < 6} className={btn}>Confirm</button><button type="button" className={btn} onClick={() => setPending(null)}>Cancel</button></div>
        </form>
      )}

      <section className={box} aria-label="View as">
        <h2 className="font-syne font-semibold text-[15px] mb-1">View as this business</h2>
        <p className="text-xs text-[#6b6b80] mb-3">Opens their dashboard. Read-only by default; ends after 30 minutes. Bank, PAN and gateway details stay hidden. Both start and end are logged with your reason.</p>
        {viewAsActive && <p className="text-sm text-amber-800 bg-amber-50 rounded-xl px-3 py-2 mb-3">A view-as is already active. Exit it from the red bar first.</p>}
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label htmlFor="view-reason" className="text-xs font-medium text-[#6b6b80]">Reason for viewing (required)</label>
            <input id="view-reason" value={viewReason} onChange={(e) => setViewReason(e.target.value)} className={input} placeholder="e.g. Support ticket #123: bookings not showing" />
            <button type="button" className={btn} disabled={busy || viewAsActive || viewReason.trim().length < 8} onClick={() => startView("READ")}>View as (read-only)</button>
          </div>
          <div className="space-y-2">
            <label htmlFor="act-reason" className="text-xs font-medium text-red-700">Act as: can edit. Its own reason (required)</label>
            <input id="act-reason" value={actReason} onChange={(e) => setActReason(e.target.value)} className={input} placeholder="e.g. Owner asked us to fix their opening hours" />
            <button type="button" className={danger} disabled={busy || viewAsActive || actReason.trim().length < 8} onClick={() => startView("ACT")}>Act as (can edit)</button>
          </div>
        </div>
      </section>

      <section className={box} aria-label="Actions">
        <h2 className="font-syne font-semibold text-[15px] mb-1">Actions</h2>
        <p className="text-xs text-[#6b6b80] mb-3">Each action is audited with this reason and needs a fresh authenticator code (valid for 5 minutes).</p>
        <label htmlFor="reason" className="text-xs font-medium text-[#6b6b80] block mb-1">Reason (required, at least 8 characters)</label>
        <input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} className={`${input} mb-4`} />
        <div className="flex flex-wrap gap-2 mb-5">
          {b.suspended
            ? <button type="button" className={btn} disabled={busy || reason.trim().length < 8} onClick={() => act("unsuspend")}>Unsuspend</button>
            : <button type="button" className={danger} disabled={busy || reason.trim().length < 8} onClick={() => confirm(`Suspend ${b.name}? New bookings will be blocked.`) && act("suspend")}>Suspend</button>}
          <button type="button" className={btn} disabled={busy || reason.trim().length < 8} onClick={() => act("resend_live_email")}>Resend “business is live” email</button>
          {!b.ownerHasPassword && <button type="button" className={btn} disabled={busy || reason.trim().length < 8} onClick={() => act("resend_setup_email")}>Resend setup email</button>}
          <button type="button" className={btn} disabled={busy || reason.trim().length < 8} onClick={() => confirm("Reset onboarding? The owner sees the setup wizard again.") && act("reset_onboarding")}>Reset onboarding</button>
        </div>

        <div className="border-t border-[#f0ede8] pt-4 mb-5">
          <h3 className="text-sm font-semibold mb-2">Plan override {b.overridePlan && <span className="text-xs font-normal text-amber-800">(active: {b.overridePlan}{b.overrideUntil ? ` until ${b.overrideUntil}` : ""})</span>}</h3>
          <div className="flex flex-wrap gap-2 items-end">
            <select aria-label="Plan" value={plan} onChange={(e) => setPlan(e.target.value as typeof plan)} className={`${input} w-44`}><option value="free">free</option><option value="professional">professional</option><option value="business">business</option></select>
            <label className="text-xs text-[#6b6b80]">Ends (optional)<input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className={`${input} w-44 block`} /></label>
            <button type="button" className={btn} disabled={busy || reason.trim().length < 8} onClick={() => act("plan_override", { plan, until })}>Apply override</button>
            {b.overridePlan && <button type="button" className={btn} disabled={busy || reason.trim().length < 8} onClick={() => act("plan_override_clear")}>Clear override</button>}
          </div>
        </div>

        <form className="border-t border-[#f0ede8] pt-4 grid sm:grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); act("edit", edit); }}>
          <h3 className="text-sm font-semibold sm:col-span-2">Edit details</h3>
          {(["name", "phone", "email", "address", "website"] as const).map((k) => (
            <label key={k} className="text-xs text-[#6b6b80] capitalize">{k === "email" ? "Business email" : k}<input value={edit[k]} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} className={`${input} block`} /></label>
          ))}
          <label className="text-xs text-[#6b6b80] sm:col-span-2">Description<textarea value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} className="w-full rounded-xl border border-[#e8e6e0] px-3 py-2 text-sm" rows={2} /></label>
          <button type="submit" className={btn} disabled={busy || reason.trim().length < 8}>Save details</button>
        </form>
      </section>
    </div>
  );
}
