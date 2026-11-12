"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ScrollText } from "lucide-react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { t, type TermsSource } from "@/lib/terms";
import type { NotificationPrefs } from "@/lib/notifications/prefs";
import { WA_PREF_KEYS, WA_PREF_LABELS } from "@/lib/whatsapp/events";
import type { NotificationSettings } from "@/lib/notifications/settings";

const LEADS: { value: number; label: string }[] = [
  { value: 60, label: "1 hour before" },
  { value: 120, label: "2 hours before" },
  { value: 180, label: "3 hours before" },
  { value: 1440, label: "24 hours before" },
  { value: 2880, label: "48 hours before" },
];
const selectCls = "w-full sm:w-64 h-11 rounded-xl border border-[#e8e6e0] bg-white px-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent disabled:opacity-50";

function Toggle({ id, label, hint, checked, onChange, disabled }: { id: string; label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-[#f0ede8] last:border-0">
      <label htmlFor={id} className="min-w-0">
        <span className="block text-sm font-medium text-[#0f0f1a]">{label}</span>
        {hint ? <span className="block text-xs text-[#6b6b80] mt-0.5">{hint}</span> : null}
      </label>
      <input id={id} type="checkbox" role="switch" aria-checked={checked} checked={checked} disabled={disabled}
        onChange={(e) => onChange(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-[#0284c7] disabled:opacity-50" />
    </div>
  );
}

export function NotificationsClient({ initial, terms }: { initial: NotificationSettings; terms: TermsSource }) {
  const [settings, setSettings] = useState(initial);
  const [prefs, setPrefs] = useState<NotificationPrefs>(initial.prefs);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const appt = t(terms, "appointment");
  const appts = t(terms, "appointment", { plural: true });
  const [first, second] = prefs.reminderLeadMinutes;

  const update = (p: NotificationPrefs) => { setPrefs(p); setStatus(null); };
  const setBusiness = (k: keyof NotificationPrefs["business"], v: boolean) => update({ ...prefs, business: { ...prefs.business, [k]: v } });
  const setCustomer = (k: keyof NotificationPrefs["customer"], v: boolean | number) => update({ ...prefs, customer: { ...prefs.customer, [k]: v } });
  const setLeads = (a: number | undefined, b: number | undefined) =>
    update({ ...prefs, reminderLeadMinutes: [a, b].filter((m): m is number => !!m && m > 0).filter((m, i, all) => all.indexOf(m) === i).sort((x, y) => y - x) });

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/settings/notifications", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(prefs) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setStatus({ ok: false, text: data.error ?? "Could not save. Please try again." }); return; }
      setSettings(data as NotificationSettings);
      setPrefs((data as NotificationSettings).prefs);
      setStatus({ ok: true, text: "Saved" });
    } catch {
      setStatus({ ok: false, text: "Could not save. Check your connection and try again." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <DashboardLayout title="Notifications" subtitle="Choose which emails you and your customers get">
      <div className="max-w-3xl space-y-6">
        <Link href="/dashboard/settings" className="inline-flex items-center gap-1.5 text-sm text-[#6b6b80] hover:text-[#0f0f1a]">
          <ArrowLeft size={14} /> Back to settings
        </Link>
        <Link href="/dashboard/settings/notifications/log" className="ml-4 inline-flex items-center gap-1.5 text-sm text-[#0284c7] hover:underline">
          <ScrollText size={14} /> View notifications log
        </Link>

        <Card>
          <CardHeader><CardTitle>Emails to you</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-[#6b6b80] pb-2">
              {settings.alertEmail
                ? <>Sent to <strong className="text-[#0f0f1a]">{settings.alertEmail}</strong>{settings.alertEmailIsLogin ? " (your login email; set a business email under Business Profile to use another)" : " (your business email, set under Business Profile)"}.</>
                : <>Add a business email under Business Profile to receive these.</>}
            </p>
            <Toggle id="n-created" label={`New ${appt}`} checked={prefs.business.created} onChange={(v) => setBusiness("created", v)} />
            <Toggle id="n-rescheduled" label={`${t(terms, "appointment", { cap: true })} rescheduled`} checked={prefs.business.rescheduled} onChange={(v) => setBusiness("rescheduled", v)} />
            <Toggle id="n-cancelled" label={`${t(terms, "appointment", { cap: true })} cancelled`} checked={prefs.business.cancelled} onChange={(v) => setBusiness("cancelled", v)} />
            <Toggle id="n-paid" label="Payment received" checked={prefs.business.paid} onChange={(v) => setBusiness("paid", v)} />
            <Toggle id="n-status" label="Other status changes" hint="Completed, no-show and missed queue calls" checked={prefs.business.status} onChange={(v) => setBusiness("status", v)} />
            <Toggle id="n-summary" label="Daily summary" hint={`Every morning at 8:00 (your time zone): yesterday's numbers and today's ${appts}`} checked={prefs.dailySummary} onChange={(v) => update({ ...prefs, dailySummary: v })} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Emails to your customers</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-[#6b6b80] pb-3">
              Confirmations, changes, cancellations and receipts are always sent. Customers can unsubscribe from the emails below.
            </p>
            {!settings.emailReminders ? (
              <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mb-3">Your plan does not include email reminders, so none are sent. <Link href="/dashboard/billing" className="underline">See plans</Link></p>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2 py-3 border-b border-[#f0ede8]">
              <div>
                <label htmlFor="n-lead-1" className="block text-sm font-medium text-[#0f0f1a] mb-1.5">Reminder</label>
                <select id="n-lead-1" className={selectCls} value={first ?? 0} disabled={!settings.emailReminders}
                  onChange={(e) => setLeads(Number(e.target.value) || undefined, Number(e.target.value) ? second : undefined)}>
                  <option value={0}>No reminders</option>
                  {LEADS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="n-lead-2" className="block text-sm font-medium text-[#0f0f1a] mb-1.5">Second reminder (optional)</label>
                <select id="n-lead-2" className={selectCls} value={second ?? 0} disabled={!settings.emailReminders || !first}
                  onChange={(e) => setLeads(first, Number(e.target.value) || undefined)}>
                  <option value={0}>None</option>
                  {LEADS.filter((l) => l.value !== first).map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
              </div>
            </div>
            <Toggle id="n-completed" label={`"Thanks for visiting" when a ${appt} is completed`} checked={prefs.customer.completed} onChange={(v) => setCustomer("completed", v)} />
            <Toggle id="n-review" label="Ask for a Google review"
              hint={settings.hasReviewLink ? `Sent ${prefs.customer.reviewDelayHours} ${prefs.customer.reviewDelayHours === 1 ? "hour" : "hours"} after a ${appt} is completed, at most once per customer every 30 days` : "Add your Google review link under Website first; until then nothing is sent"}
              checked={prefs.customer.reviewRequest} onChange={(v) => setCustomer("reviewRequest", v)} />
            <div>
              <label htmlFor="n-review-delay" className="block text-sm font-medium text-[#0f0f1a] mb-1.5">Hours to wait before asking (1 to 48)</label>
              <input id="n-review-delay" type="number" inputMode="numeric" min={1} max={48} step={1} disabled={!prefs.customer.reviewRequest}
                className={selectCls} value={prefs.customer.reviewDelayHours}
                onChange={(e) => setCustomer("reviewDelayHours", Math.min(48, Math.max(1, Math.round(Number(e.target.value) || 1))))} />
            </div>
          </CardContent>
        </Card>

        {settings.whatsappSetUp && (
          <Card>
            <CardHeader><CardTitle>WhatsApp to your customers</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-[#6b6b80] mb-2">Sent in addition to the email, only to customers who ticked &quot;Get updates on WhatsApp&quot; when booking, and never after they reply STOP. If a message cannot go on WhatsApp (template not approved, connection paused), they still get the email.</p>
              {WA_PREF_KEYS.map((k) => (
                <Toggle key={k} id={`wa-${k}`} label={WA_PREF_LABELS[k]}
                  hint={k === "reviewRequest" ? "Off by default. Meta may treat review requests as marketing." : undefined}
                  checked={prefs.whatsapp[k]} onChange={(v) => update({ ...prefs, whatsapp: { ...prefs.whatsapp, [k]: v } })} />
              ))}
            </CardContent>
          </Card>
        )}

        <div className="flex items-center gap-3">
          <Button onClick={save} loading={saving}>Save</Button>
          {status ? <p role="status" className={`text-sm ${status.ok ? "text-emerald-700" : "text-red-600"}`}>{status.text}</p> : null}
        </div>
      </div>
    </DashboardLayout>
  );
}
