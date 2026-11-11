"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { disablePush, requestPushPermission } from "@/components/dashboard/PushSetup";

type Prefs = Record<string, boolean>;

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
    </div>
  );
}
