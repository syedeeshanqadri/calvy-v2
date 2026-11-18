"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink, Plus, Star, Trash2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { GATEWAYS, gatewaysForRegion, type GatewayProviderId, type GatewayMeta } from "@/lib/payments/gatewayMeta";
import { fromMinorUnits, toMinorUnits } from "@/lib/currency";
import type { PayRegion } from "@/lib/payments/region";
import type { GatewayView } from "@/lib/payments/gatewayStore";

export interface ServicePay { id: string; name: string; price: number; payOption: string | null; advanceKind: string | null; advanceValue: number | null }

export interface GatewaySettingsProps {
  currency: string;
  isIndia: boolean;
  /** Which gateways to offer: India-only ones for India, international ones for everyone else. */
  region: PayRegion;
  live: boolean;
  /** Mid/Top plans. Basic only ever pays Calvy's Rs 10 confirmation fee. */
  canUseOwnGateway: boolean;
  feeMinorIN: number;
  gateways: GatewayView[];
  payOption: string;
  advanceKind: string;
  advanceValue: number;
  services: ServicePay[];
}

const card = "bg-white rounded-2xl border border-[#e8e6e0] p-5";
const input = "mt-1 w-full h-10 px-3 rounded-xl bg-white border border-[#e8e6e0] text-sm";
const btn = "h-10 px-4 rounded-xl text-sm font-semibold disabled:opacity-50";

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 2000); } catch { /* clipboard blocked */ } }}
      className="inline-flex items-center gap-1 h-9 px-3 rounded-lg border border-[#e8e6e0] text-xs font-semibold">
      {done ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}
    </button>
  );
}

function StatusBadge({ g }: { g: GatewayView }) {
  const tone = g.status === "CONNECTED" ? "bg-emerald-50 text-emerald-700" : g.status === "ERROR" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700";
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${tone}`}>{g.status === "CONNECTED" ? "Connected" : g.status === "ERROR" ? "Error" : "Not verified"}</span>;
}

function AddGateway({ region, currency, onDone, onCancel }: { region: PayRegion; currency: string; onDone: () => void; onCancel: () => void }) {
  const [provider, setProvider] = useState<GatewayProviderId | null>(null);
  const [mode, setMode] = useState<"TEST" | "LIVE">("TEST");
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<GatewayView | null>(null);
  const meta: GatewayMeta | null = provider ? GATEWAYS[provider] : null;

  async function save() {
    if (!provider) return;
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/settings/gateways", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, mode, ...values }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json.error ?? "Could not save."); return; }
      setCreated(json.gateway);
    } finally { setBusy(false); }
  }

  if (created && meta) {
    return (
      <div className={`${card} space-y-4`}>
        <div className="flex items-center gap-2">
          {created.status === "CONNECTED" ? <CheckCircle2 className="text-emerald-600" size={20} /> : <AlertTriangle className="text-red-600" size={20} />}
          <h3 className="font-syne font-bold text-lg">{meta.label}: {created.status === "CONNECTED" ? "Connected" : "Could not connect"}</h3>
        </div>
        {created.statusReason && <p role="alert" className="text-sm rounded-xl bg-red-50 text-red-700 px-3 py-2">{created.statusReason}</p>}
        <div>
          {meta.webhook.none ? (
            <p className="text-sm text-[#6b6b80]">{meta.webhook.instructions} {meta.note}</p>
          ) : (
            <>
              <p className="text-sm font-semibold">Last step: tell {meta.label} where to send payment events</p>
              <p className="text-sm text-[#6b6b80] mt-1">{meta.webhook.instructions} Events to tick: <strong>{meta.webhook.events}</strong>.</p>
              <div className="mt-2 flex items-center gap-2"><code className="flex-1 min-w-0 truncate text-xs bg-[#f6f5f1] rounded-lg px-3 py-2">{created.webhookUrl}</code><CopyButton text={created.webhookUrl} /></div>
              <p className="text-xs text-[#6b6b80] mt-2">Without this step, customers still pay, but the booking is confirmed only when they return to the page.</p>
            </>
          )}
        </div>
        <button type="button" onClick={onDone} className={`${btn} bg-[#0f0f1a] text-white`}>Done</button>
      </div>
    );
  }

  return (
    <div className={`${card} space-y-4`}>
      <div className="flex items-center justify-between"><h3 className="font-syne font-bold text-lg">Add payment gateway</h3><button type="button" onClick={onCancel} className="text-sm underline text-[#6b6b80]">Cancel</button></div>
      <div className="grid sm:grid-cols-3 gap-3">
        {gatewaysForRegion(region).map((g) => {
          const unsupported = !!g.currencies && !g.currencies.includes(currency.toUpperCase());
          return (
          <button key={g.id} type="button" disabled={unsupported} onClick={() => { setProvider(g.id); setValues({}); setError(""); }}
            className={`text-left p-4 rounded-xl border-2 disabled:opacity-50 ${provider === g.id ? "border-[#0f0f1a]" : "border-[#e8e6e0]"}`}>
            <span className="grid place-items-center h-10 w-10 rounded-xl bg-[#0f0f1a] text-white font-bold text-sm">{g.label.slice(0, 2)}</span>
            <p className="font-semibold mt-2">{g.label}</p>
            <p className="text-xs text-[#6b6b80]">{unsupported ? `Not available in ${currency.toUpperCase()}.` : g.tagline}</p>
          </button>
          );
        })}
      </div>
      {meta && (
        <>
          <div className="rounded-xl bg-[#f6f5f1] p-4 space-y-2">
            <p className="text-sm font-semibold">Where to find your {meta.label} keys</p>
            <ol className="list-decimal pl-5 text-sm text-[#3d3d4d] space-y-1">{meta.guide.steps.map((s) => <li key={s}>{s}</li>)}</ol>
            <p className="text-sm flex flex-wrap gap-x-4">{meta.guide.links.map((l) => <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer" className="underline inline-flex items-center gap-1">{l.label} <ExternalLink size={12} /></a>)}</p>
          </div>
          <fieldset className="flex gap-2" aria-label="Mode">
            {(["TEST", "LIVE"] as const).map((m) => (
              <button key={m} type="button" onClick={() => setMode(m)} className={`${btn} border ${mode === m ? "bg-[#0f0f1a] text-white border-[#0f0f1a]" : "border-[#e8e6e0]"}`}>{(meta.modeLabels ?? { TEST: "Test mode", LIVE: "Live mode" })[m]}</button>
            ))}
          </fieldset>
          {meta.note && <p className="text-sm rounded-xl bg-amber-50 text-amber-900 px-3 py-2">{meta.note}</p>}
          <div className="grid sm:grid-cols-2 gap-3">
            {meta.fields.map((f) => (
              <label key={f.key} className="block text-xs font-semibold text-[#6b6b80]">{f.label}
                <input type={f.secret ? "password" : "text"} autoComplete="off" spellCheck={false} placeholder={f.placeholder} value={values[f.key] ?? ""}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} className={input} />
              </label>
            ))}
          </div>
          {error && <p role="alert" className="text-sm rounded-xl bg-red-50 text-red-700 px-3 py-2">{error}</p>}
          <p className="text-xs text-[#6b6b80]">Your keys are encrypted and never shown again. Saving runs a quick check with {meta.label}.</p>
          <button type="button" onClick={save} disabled={busy} className={`${btn} bg-[#0f0f1a] text-white`}>{busy ? "Verifying…" : "Save and verify"}</button>
        </>
      )}
    </div>
  );
}

function GatewayCard({ g, onChanged }: { g: GatewayView; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const meta = GATEWAYS[g.provider];
  async function call(path: string, init: RequestInit) {
    setBusy(true); setError("");
    try {
      const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...init });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) setError(json.error ?? "Something went wrong."); else onChanged();
    } finally { setBusy(false); }
  }
  const patch = (body: object) => call(`/api/settings/gateways/${g.id}`, { method: "PATCH", body: JSON.stringify(body) });
  return (
    <div className={`${card} space-y-3`}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">{g.label}</h3>
        <StatusBadge g={g} />
        <span className="text-xs px-2 py-0.5 rounded-full bg-[#f6f5f1]">{g.mode === "LIVE" ? "Live" : "Test"}</span>
        {g.isDefault && <span className="text-xs px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 inline-flex items-center gap-1"><Star size={12} /> Default</span>}
        <span className="ml-auto text-xs text-[#6b6b80] font-mono">{g.keyIdMasked}</span>
      </div>
      {g.statusReason && <p className="text-sm rounded-xl bg-red-50 text-red-700 px-3 py-2">{g.statusReason}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => call(`/api/settings/gateways/${g.id}/verify`, { method: "POST" })} className={`${btn} border border-[#e8e6e0]`}>Verify</button>
        {g.status === "CONNECTED" && !g.isDefault && <button type="button" disabled={busy} onClick={() => patch({ isDefault: true })} className={`${btn} border border-[#e8e6e0]`}>Make default</button>}
        {g.status === "CONNECTED" && <button type="button" disabled={busy} onClick={() => patch({ enabled: !g.enabled })} className={`${btn} border border-[#e8e6e0]`}>{g.enabled ? "Disable" : "Enable"}</button>}
        <button type="button" disabled={busy} onClick={() => patch({ mode: g.mode === "LIVE" ? "TEST" : "LIVE" })} className={`${btn} border border-[#e8e6e0]`}>Switch to {g.mode === "LIVE" ? "test" : "live"}</button>
        <button type="button" disabled={busy} onClick={() => { if (confirm(`Remove ${g.label}? Payments already taken keep their record.`)) call(`/api/settings/gateways/${g.id}`, { method: "DELETE" }); }} className={`${btn} border border-red-200 text-red-700 inline-flex items-center gap-1`}><Trash2 size={14} /> Remove</button>
      </div>
      {meta.webhook.none ? <p className="text-xs text-[#6b6b80]">{meta.note}</p> : <div>
        <p className="text-xs font-semibold text-[#6b6b80]">Webhook URL for {meta.label} ({meta.webhook.events})</p>
        <div className="mt-1 flex items-center gap-2"><code className="flex-1 min-w-0 truncate text-xs bg-[#f6f5f1] rounded-lg px-3 py-2">{g.webhookUrl}</code><CopyButton text={g.webhookUrl} /></div>
      </div>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </div>
  );
}

const OPTION_LABEL: Record<string, string> = { VENUE: "Pay at venue", ONLINE_FULL: "Pay online in full", ADVANCE: "Advance online, rest at venue" };

function PayOptions({ p, hasDefault }: { p: GatewaySettingsProps; hasDefault: boolean }) {
  const router = useRouter();
  const [option, setOption] = useState(p.payOption);
  const [kind, setKind] = useState(p.advanceKind);
  const [value, setValue] = useState(String(p.advanceKind === "FIXED" ? fromMinorUnits(p.advanceValue, p.currency) : p.advanceValue));
  const [svc, setSvc] = useState<Record<string, string>>(() => Object.fromEntries(p.services.map((s) => [s.id, s.payOption ?? ""])));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    setBusy(true); setMsg(null);
    try {
      const n = Number(value);
      const advanceValue = kind === "FIXED" ? toMinorUnits(n, p.currency) : Math.round(n);
      const services = Object.fromEntries(p.services.filter((s) => (s.payOption ?? "") !== svc[s.id]).map((s) => [s.id, svc[s.id] ? { payOption: svc[s.id], advanceKind: kind, advanceValue } : { payOption: null }]));
      const res = await fetch("/api/settings/payments", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ payOption: option, advanceKind: kind, advanceValue: advanceValue || 1, services }) });
      const json = await res.json().catch(() => ({}));
      setMsg(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: json.error ?? "Could not save." });
      if (res.ok) router.refresh();
    } finally { setBusy(false); }
  }

  return (
    <div className={`${card} space-y-4`}>
      <h3 className="font-syne font-bold text-lg">How customers pay</h3>
      <div className="grid sm:grid-cols-3 gap-3">
        {Object.entries(OPTION_LABEL).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setOption(k)} className={`text-left p-3 rounded-xl border-2 text-sm font-semibold ${option === k ? "border-[#0f0f1a]" : "border-[#e8e6e0]"}`}>{label}</button>
        ))}
      </div>
      {option === "ADVANCE" && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-semibold text-[#6b6b80]">Advance is
            <select value={kind} onChange={(e) => setKind(e.target.value)} className={input}><option value="PERCENT">a percentage</option><option value="FIXED">a fixed amount</option></select>
          </label>
          <label className="text-xs font-semibold text-[#6b6b80]">{kind === "PERCENT" ? "Percent of the price" : `Amount (${p.currency})`}
            <input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} className={input} />
          </label>
        </div>
      )}
      {!hasDefault && option !== "VENUE" && <p className="text-sm rounded-xl bg-amber-50 text-amber-900 px-3 py-2">Connect and verify a gateway above first; without one, customers pay at the venue.</p>}
      {p.services.length > 0 && (
        <details>
          <summary className="text-sm font-semibold cursor-pointer">Different option for a service</summary>
          <div className="mt-2 space-y-2">
            {p.services.map((s) => (
              <label key={s.id} className="flex items-center gap-3 text-sm">
                <span className="flex-1 min-w-0 truncate">{s.name}</span>
                <select value={svc[s.id]} onChange={(e) => setSvc({ ...svc, [s.id]: e.target.value })} className="h-9 px-2 rounded-lg border border-[#e8e6e0] text-sm">
                  <option value="">Same as business</option>
                  {Object.entries(OPTION_LABEL).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
              </label>
            ))}
          </div>
        </details>
      )}
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm rounded-xl px-3 py-2 ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{msg.text}</p>}
      <button type="button" onClick={save} disabled={busy} className={`${btn} bg-[#0f0f1a] text-white`}>{busy ? "Saving…" : "Save payment options"}</button>
    </div>
  );
}

export function GatewaySettings(p: GatewaySettingsProps) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);

  if (!p.canUseOwnGateway) {
    return (
      <div className={`${card} space-y-3`}>
        <h3 className="font-syne font-bold text-lg">Online payments</h3>
        {p.region === "IN" ? (
          <>
            <p className="text-sm text-[#3d3d4d]">On your current plan, customers pay a Rs {p.feeMinorIN / 100} confirmation fee to Calvy when they book, and pay for the service at the venue.</p>
            <div className="rounded-xl bg-[#f6f5f1] p-4">
              <p className="text-sm font-semibold">Take payments into your own account</p>
              <p className="text-sm text-[#6b6b80] mt-1">On the Pro and Business plans there is no Rs {p.feeMinorIN / 100} fee. You connect your own Razorpay, Cashfree, PhonePe, PayU, CCAvenue or Paytm account, and customers pay you directly, in full or as an advance. Calvy never holds your money.</p>
              <Link href="/dashboard/billing" className="inline-block mt-3 text-sm font-semibold underline">See plans</Link>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-[#3d3d4d]">On your current plan, customers pay for the service at the venue.</p>
            <div className="rounded-xl bg-[#f6f5f1] p-4">
              <p className="text-sm font-semibold">Take payments into your own account</p>
              <p className="text-sm text-[#6b6b80] mt-1">On a paid plan you connect your own Stripe or PayPal account, and customers pay you directly in {p.currency}, in full or as an advance. Calvy never holds your money.</p>
              <Link href="/dashboard/billing" className="inline-block mt-3 text-sm font-semibold underline">See plans</Link>
            </div>
          </>
        )}
      </div>
    );
  }

  const hasDefault = p.gateways.some((g) => g.isDefault && g.enabled && g.status === "CONNECTED");
  const refresh = () => { setAdding(false); router.refresh(); };
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-syne font-bold text-lg">Payment gateways</h3>
          <p className="text-sm text-[#6b6b80]">Customers pay straight into your own account. Calvy never touches the money.</p>
        </div>
        {!adding && <button type="button" onClick={() => setAdding(true)} className={`${btn} bg-[#0f0f1a] text-white inline-flex items-center gap-1 shrink-0`}><Plus size={16} /> Add payment gateway</button>}
      </div>
      {!p.live && <p className="text-sm rounded-xl bg-amber-50 text-amber-900 px-3 py-2">Online payments are switched off for now (FEATURE_ONLINE_PAYMENTS). You can connect a gateway; customers will not be charged until it is switched on.</p>}
      {adding && <AddGateway region={p.region} currency={p.currency} onDone={refresh} onCancel={() => setAdding(false)} />}
      {p.gateways.length === 0 && !adding && <div className={card}><p className="text-sm text-[#6b6b80]">No gateway yet. Add one to take online payments; until then customers pay at the venue.</p></div>}
      {p.gateways.map((g) => <GatewayCard key={g.id} g={g} onChanged={refresh} />)}
      <PayOptions p={p} hasDefault={hasDefault} />
    </div>
  );
}
