"use client";
import { useEffect, useState } from "react";
import { CalendarDays, Copy, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface Feed { target: string; kind: "business" | "staff"; name: string; url: string; links: { webcal: string; google: string; outlook: string } }

/** Private subscribable calendar feeds: one for the whole business and one per staff member. Owner only. */
export function CalendarFeeds() {
  const [feeds, setFeeds] = useState<Feed[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    fetch("/api/settings/calendar").then((r) => (r.ok ? r.json() : Promise.reject())).then((d) => setFeeds(d.feeds)).catch(() => setError("Could not load your calendar links."));
  }, []);

  async function copy(f: Feed) {
    try {
      await navigator.clipboard.writeText(f.url);
      setCopied(f.target);
      setTimeout(() => setCopied(""), 2000);
    } catch { setError("Could not copy. Select the link and copy it by hand."); }
  }

  async function regenerate(f: Feed) {
    if (!window.confirm(`Make a new private link for "${f.name}"? Calendars using the old link will stop updating until you add the new one.`)) return;
    setBusy(f.target); setError("");
    const r = await fetch("/api/settings/calendar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ target: f.target }) });
    setBusy("");
    if (!r.ok) { setError((await r.json().catch(() => ({}))).error ?? "Could not make a new link."); return; }
    setFeeds((await r.json()).feeds);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0"><CalendarDays size={18} aria-hidden /></span>
        <p className="text-sm text-[#6b6b80]">
          See your bookings in Google Calendar, Outlook or Apple Calendar. Add a link below as a calendar subscription: new, moved and cancelled bookings
          appear on their own (calendar apps refresh every few hours). <strong className="text-[#0f0f1a]">These links are private.</strong> Anyone who has one can see those bookings, so do not share them. If a link leaks, make a new one.
        </p>
      </div>
      {error && <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{error}</p>}
      {!feeds && !error && <p className="text-sm text-[#6b6b80]">Loading…</p>}
      <ul className="space-y-3">
        {feeds?.map((f) => (
          <li key={f.target} className="rounded-xl border border-[#e8e6e0] p-4">
            <p className="font-semibold text-sm text-[#0f0f1a]">{f.name}</p>
            <input readOnly value={f.url} onFocus={(e) => e.currentTarget.select()} aria-label={`Private calendar link for ${f.name}`} className="mt-2 w-full rounded-lg border border-[#e8e6e0] bg-[#f8f7f4] px-3 py-2 text-xs text-[#4b4b5a]" />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => copy(f)}><Copy size={13} aria-hidden /> {copied === f.target ? "Copied" : "Copy link"}</Button>
              <a href={f.links.google} target="_blank" rel="noreferrer" className="text-xs font-semibold text-sky-700 hover:underline px-2 py-2">Add to Google</a>
              <a href={f.links.outlook} target="_blank" rel="noreferrer" className="text-xs font-semibold text-sky-700 hover:underline px-2 py-2">Add to Outlook</a>
              <a href={f.links.webcal} className="text-xs font-semibold text-sky-700 hover:underline px-2 py-2">Add to Apple Calendar</a>
              <Button size="sm" variant="outline" onClick={() => regenerate(f)} disabled={busy === f.target} className="ml-auto"><RefreshCw size={13} aria-hidden /> {busy === f.target ? "Working…" : "New link"}</Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
