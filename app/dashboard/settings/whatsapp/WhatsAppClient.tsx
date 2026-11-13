"use client";
import { useState } from "react";
import Link from "next/link";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/Button";

interface Config {
  phoneNumberId: string; wabaId: string; accessTokenMasked: string | null; appSecretMasked: string | null;
  callbackUrl: string; verifyToken: string; status: "PENDING" | "CONNECTED" | "ERROR"; statusReason: string | null;
  displayPhone: string | null; verifiedName: string | null; qualityRating: string | null; messagingTier: string | null; lastCheckedAt: string | null;
}
interface Tpl { name: string; language: string; status: string; reason: string | null }

const input = "w-full h-10 px-3 rounded-xl bg-white border border-[#e8e6e0] text-sm outline-none focus:border-accent/40";
const TIER: Record<string, string> = { TIER_50: "50 customers / day", TIER_250: "250 customers / day", TIER_1K: "1,000 customers / day", TIER_10K: "10,000 customers / day", TIER_100K: "100,000 customers / day", TIER_UNLIMITED: "Unlimited" };
const QUALITY: Record<string, string> = { GREEN: "text-emerald-700 bg-emerald-50", YELLOW: "text-amber-700 bg-amber-50", RED: "text-red-700 bg-red-50" };
const TPL_COLOR: Record<string, string> = { APPROVED: "text-emerald-700 bg-emerald-50", PENDING: "text-amber-700 bg-amber-50", REJECTED: "text-red-700 bg-red-50" };

const Pill = ({ cls, children }: { cls: string; children: React.ReactNode }) => <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>{children}</span>;

async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, json };
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false);
  return (
    <div>
      <p className="text-xs font-semibold text-[#6b6b80] mb-1">{label}</p>
      <div className="flex gap-2">
        <input readOnly value={value} className={`${input} font-mono text-xs`} onFocus={(e) => e.currentTarget.select()} />
        <Button size="sm" variant="outline" onClick={() => { navigator.clipboard?.writeText(value).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }); }}>{done ? "Copied" : "Copy"}</Button>
      </div>
    </div>
  );
}

export function WhatsAppClient({ initialConfig, initialTemplates }: { initialConfig: Config | null; initialTemplates: Tpl[] }) {
  const [config, setConfig] = useState(initialConfig);
  const [templates, setTemplates] = useState(initialTemplates);
  const [phoneNumberId, setPhoneNumberId] = useState(initialConfig?.phoneNumberId ?? "");
  const [wabaId, setWabaId] = useState(initialConfig?.wabaId ?? "");
  const [accessToken, setAccessToken] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [testTo, setTestTo] = useState("");

  const run = async (key: string, fn: () => Promise<void>) => { setBusy(key); setMsg(null); try { await fn(); } finally { setBusy(""); } };

  const saveAndVerify = () => run("save", async () => {
    const saved = await call("/api/settings/whatsapp", "PUT", { phoneNumberId, wabaId, accessToken, appSecret });
    if (!saved.ok) { setMsg({ ok: false, text: saved.json.error ?? "Could not save." }); return; }
    setAccessToken(""); setAppSecret("");
    const v = await call("/api/settings/whatsapp/verify", "POST");
    if (v.json.config) setConfig(v.json.config);
    setMsg(v.ok && v.json.ok ? { ok: true, text: "Connected." } : { ok: false, text: v.json.config?.statusReason ?? v.json.error ?? "Verification failed." });
  });
  const verify = () => run("verify", async () => {
    const v = await call("/api/settings/whatsapp/verify", "POST");
    if (v.json.config) setConfig(v.json.config);
    setMsg(v.ok && v.json.ok ? { ok: true, text: "Connected." } : { ok: false, text: v.json.config?.statusReason ?? v.json.error ?? "Verification failed." });
  });
  const templateAction = (action: "install" | "refresh") => run(action, async () => {
    const r = await call("/api/settings/whatsapp/templates", "POST", { action });
    if (!r.ok) { setMsg({ ok: false, text: r.json.error ?? "Failed." }); return; }
    setTemplates(r.json.templates);
    setMsg(r.json.failures?.length ? { ok: false, text: `Some templates were refused: ${r.json.failures.slice(0, 2).join("; ")}` } : { ok: true, text: action === "install" ? "Templates sent to Meta for approval." : "Statuses refreshed." });
  });
  const sendTest = () => run("test", async () => {
    const r = await call("/api/settings/whatsapp/test", "POST", { to: testTo });
    setMsg(r.ok ? { ok: true, text: "Test message sent." } : { ok: false, text: r.json.error ?? "Could not send." });
  });
  const disconnect = () => run("disconnect", async () => {
    if (!confirm("Disconnect WhatsApp? Customers will get email only.")) return;
    await call("/api/settings/whatsapp", "DELETE");
    setConfig(null); setTemplates([]); setPhoneNumberId(""); setWabaId("");
  });

  const connected = config?.status === "CONNECTED";
  return (
    <DashboardLayout title="WhatsApp" subtitle="Message customers from your own WhatsApp Business number">
      <div className="max-w-3xl space-y-6">
        <p className="text-sm text-[#6b6b80]">Calvy uses Meta&apos;s official WhatsApp Cloud API with your own WhatsApp Business Account; Meta bills you directly. Email always stays as the fallback. <Link href="/dashboard/settings/whatsapp/guide" className="text-accent underline">Step-by-step setup guide</Link></p>

        {msg && <p role="status" className={`text-sm rounded-xl px-3 py-2 ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{msg.text}</p>}

        <section className="bg-white rounded-2xl border border-[#e8e6e0] p-5 space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="font-syne font-bold text-base">Connection</h2>
            {config && <Pill cls={connected ? "text-emerald-700 bg-emerald-50" : config.status === "ERROR" ? "text-red-700 bg-red-50" : "text-amber-700 bg-amber-50"}>{config.status === "PENDING" ? "NOT VERIFIED" : config.status}</Pill>}
          </div>
          {config?.status === "ERROR" && <p className="text-sm text-red-700">{config.statusReason} WhatsApp sending is paused; customers get email.</p>}
          {connected && (
            <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div><dt className="text-xs text-[#6b6b80]">Number</dt><dd>{config.displayPhone ?? "-"}</dd></div>
              <div><dt className="text-xs text-[#6b6b80]">Display name</dt><dd>{config.verifiedName ?? "-"}</dd></div>
              <div><dt className="text-xs text-[#6b6b80]">Quality rating</dt><dd><Pill cls={QUALITY[config.qualityRating ?? ""] ?? "text-[#6b6b80] bg-[#f0ede8]"}>{config.qualityRating ?? "UNKNOWN"}</Pill></dd></div>
              <div><dt className="text-xs text-[#6b6b80]">Messaging limit</dt><dd>{TIER[config.messagingTier ?? ""] ?? config.messagingTier ?? "-"}</dd></div>
            </dl>
          )}
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-xs font-semibold text-[#6b6b80]">Phone number ID<input className={`${input} mt-1`} value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} inputMode="numeric" autoComplete="off" /></label>
            <label className="text-xs font-semibold text-[#6b6b80]">WhatsApp Business Account ID<input className={`${input} mt-1`} value={wabaId} onChange={(e) => setWabaId(e.target.value)} inputMode="numeric" autoComplete="off" /></label>
            <label className="text-xs font-semibold text-[#6b6b80]">Permanent access token<input type="password" className={`${input} mt-1`} value={accessToken} onChange={(e) => setAccessToken(e.target.value)} placeholder={config?.accessTokenMasked ?? ""} autoComplete="off" /></label>
            <label className="text-xs font-semibold text-[#6b6b80]">App secret<input type="password" className={`${input} mt-1`} value={appSecret} onChange={(e) => setAppSecret(e.target.value)} placeholder={config?.appSecretMasked ?? ""} autoComplete="off" /></label>
          </div>
          {config && <p className="text-xs text-[#6b6b80]">Leave the token and secret blank to keep the saved ones.</p>}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" loading={busy === "save"} onClick={saveAndVerify} disabled={!phoneNumberId || !wabaId || (!config && (!accessToken || !appSecret))}>Save and verify</Button>
            {config && <Button size="sm" variant="outline" loading={busy === "verify"} onClick={verify}>Verify again</Button>}
            {config && <Button size="sm" variant="outline" loading={busy === "disconnect"} onClick={disconnect}>Disconnect</Button>}
          </div>
        </section>

        {config && (
          <section className="bg-white rounded-2xl border border-[#e8e6e0] p-5 space-y-3">
            <h2 className="font-syne font-bold text-base">Webhook</h2>
            <p className="text-sm text-[#6b6b80]">In your Meta app: WhatsApp &gt; Configuration &gt; Webhook. Paste these two values, verify, then subscribe to <b>messages</b> and <b>message_template_status_update</b>. This is how delivery status and STOP replies reach Calvy.</p>
            <CopyField label="Callback URL" value={config.callbackUrl} />
            <CopyField label="Verify token" value={config.verifyToken} />
          </section>
        )}

        {connected && (
          <section className="bg-white rounded-2xl border border-[#e8e6e0] p-5 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-syne font-bold text-base mr-auto">Message templates</h2>
              <Button size="sm" loading={busy === "install"} onClick={() => templateAction("install")}>Install Calvy templates</Button>
              <Button size="sm" variant="outline" loading={busy === "refresh"} onClick={() => templateAction("refresh")} disabled={!templates.length}>Refresh status</Button>
            </div>
            <p className="text-xs text-[#6b6b80]">Utility templates in English and Hindi. Meta reviews each one (usually minutes to a day). WhatsApp is only used for a message once its template is APPROVED.</p>
            {templates.length > 0 && (
              <ul className="divide-y divide-[#f0ede8] text-sm">
                {templates.map((t) => (
                  <li key={`${t.name}:${t.language}`} className="py-2 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs">{t.name}</span><span className="text-xs text-[#6b6b80]">{t.language}</span>
                    <Pill cls={TPL_COLOR[t.status] ?? "text-[#6b6b80] bg-[#f0ede8]"}>{t.status}</Pill>
                    {t.reason && <span className="text-xs text-red-700">{t.reason}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {connected && (
          <section className="bg-white rounded-2xl border border-[#e8e6e0] p-5 space-y-3">
            <h2 className="font-syne font-bold text-base">Send a test message</h2>
            <div className="flex gap-2">
              <input className={input} value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="+91 98765 43210" inputMode="tel" autoComplete="off" />
              <Button size="sm" loading={busy === "test"} onClick={sendTest} disabled={testTo.trim().length < 5}>Send test</Button>
            </div>
            <p className="text-xs text-[#6b6b80]">Uses the approved test template. With a Meta test number, the recipient must be on your allowed list.</p>
          </section>
        )}
      </div>
    </DashboardLayout>
  );
}
