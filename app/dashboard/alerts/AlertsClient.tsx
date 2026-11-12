"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { disablePush, requestPushPermission } from "@/components/dashboard/PushSetup";

type Prefs = Record<string, boolean>;
interface WaState { available: boolean; phoneMasked: string | null; verified: boolean; optIn: boolean }

/** Your own WhatsApp number for the same alerts: verify with a test message, then opt in. What you get follows your access. */
function WhatsAppCard() {
  const [st, setSt] = useState<WaState | null>(null);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  useEffect(() => { void fetch("/api/account/whatsapp").then((r) => (r.ok ? r.json() : null)).then(setSt); }, []);
  if (!st || !st.available) return null;

  async function call(method: string, body?: unknown) {
    setBusy(true); setErr(""); setNote("");
    const r = await fetch("/api/account/whatsapp", { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setErr(j.error ?? "Something went wrong."); return false; }
    setSt(j); return true;
  }
  return (
    <Card>
      <CardHeader><CardTitle>WhatsApp alerts</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-[#6b6b80]">Get the same alerts on your own WhatsApp number. You only get what your access allows, and the choices below apply here too.</p>
        {st.phoneMasked && <p className="text-sm">Number: <span className="font-mono">{st.phoneMasked}</span> {st.verified ? "(test message sent)" : ""}</p>}
        <div className="flex gap-2">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" inputMode="tel" autoComplete="off" className="w-full h-10 px-3 rounded-xl bg-white border border-[#e8e6e0] text-sm" />
          <Button size="sm" disabled={busy || phone.trim().length < 5} onClick={async () => { if (await call("POST", { phone })) { setPhone(""); setNote("Test message sent. Check WhatsApp, then turn alerts on."); } }}>Send test</Button>
        </div>
        {st.verified && (
          <label className="flex items-center justify-between text-sm font-medium">
            Send my alerts on WhatsApp
            <input type="checkbox" role="switch" className="size-5 accent-sky-600" checked={st.optIn} disabled={busy} onChange={(e) => void call("PUT", { optIn: e.target.checked })} />
          </label>
        )}
        {st.phoneMasked && <button className="text-xs text-red-600 underline" disabled={busy} onClick={() => void call("DELETE")}>Remove my number</button>}
        {note && <p role="status" className="text-sm text-green-700">{note}</p>}
        {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
      </CardContent>
    </Card>
  );
}

export function AlertsClient({ offered, configured }: { offered: { field: string; label: string }[]; configured: boolean }) {
  const [prefs, setPrefs] = useState<Prefs>({});
  const [devices, setDevices] = useState(0);
  const [here, setHere] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const r = await fetch("/api/push/preferences");
    if (r.ok) { const d = await r.json(); setPrefs(d.prefs); setDevices(d.devices); }
    try {
      const reg = await navigator.serviceWorker?.getRegistration("/");
      setHere(!!(await reg?.pushManager.getSubscription()));
    } catch { setHere(false); }
  }
  useEffect(() => { void load(); }, []);

  async function toggle(field: string, value: boolean) {
    setPrefs((p) => ({ ...p, [field]: value }));
    const r = await fetch("/api/push/preferences", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [field]: value }) });
    if (!r.ok) { setError("Could not save that choice."); setPrefs((p) => ({ ...p, [field]: !value })); } else { setError(""); }
  }

  async function enable() {
    setBusy(true); setError(""); setMsg("");
    const r = await requestPushPermission();
    setBusy(false);
    if (r.ok) { setMsg("Phone alerts are on for this device."); await load(); } else setError(r.error ?? "Could not turn alerts on.");
  }
  async function disable() {
    setBusy(true); setError(""); setMsg("");
    await disablePush();
    setBusy(false); setMsg("Phone alerts are off for this device."); await load();
  }

  return (
    <div className="max-w-xl space-y-6">
      <Card>
        <CardHeader><CardTitle>This device</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-[#6b6b80]">{here ? "Alerts are on for this device." : "Alerts are off for this device."} {devices > 0 && `You have ${devices} device${devices === 1 ? "" : "s"} registered.`}</p>
          {!configured && <p className="text-xs text-amber-800 bg-amber-50 rounded-lg px-3 py-2">Phone alerts are not set up on the server yet.</p>}
          <div className="flex gap-2">
            {here
              ? <Button variant="outline" size="sm" onClick={disable} disabled={busy}>Turn off on this device</Button>
              : <Button size="sm" onClick={enable} disabled={busy || !configured}>Turn on for this device</Button>}
          </div>
          <p className="text-xs text-[#6b6b80]">Signing out turns alerts off on this device only, so a shared phone never shows someone else&apos;s alerts. Your other devices keep theirs. On iPhone, install the app first (Share → Add to Home Screen).</p>
          {msg && <p role="status" className="text-sm text-green-700">{msg}</p>}
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>What to alert me about</CardTitle></CardHeader>
        <CardContent>
          {offered.length === 0 ? <p className="text-sm text-[#6b6b80]">No alerts are available with your current access.</p> : (
            <ul className="divide-y divide-[#f0ede8]">
              {offered.map((o) => (
                <li key={o.field} className="flex items-center justify-between py-3">
                  <label htmlFor={`pref-${o.field}`} className="text-sm font-medium">{o.label}</label>
                  <input id={`pref-${o.field}`} type="checkbox" role="switch" className="size-5 accent-sky-600" checked={prefs[o.field] ?? true} onChange={(e) => toggle(o.field, e.target.checked)} />
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-[#6b6b80] mt-3">Alerts show a name, a time and a service. Never a phone number or email.</p>
        </CardContent>
      </Card>

      <WhatsAppCard />
    </div>
  );
}
