"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, Clock, ListOrdered, Phone, RefreshCw, Repeat, Star, UserRound, Video, XCircle } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";
import type { BookingView } from "@/lib/customerData";

const CHIP: Record<string, string> = {
  confirmed: "bg-green-50 text-green-700 border-green-200",
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  pending_payment: "bg-amber-50 text-amber-700 border-amber-200",
  completed: "bg-sky-50 text-sky-700 border-sky-200",
  cancelled: "bg-red-50 text-red-700 border-red-200",
  "no-show": "bg-gray-100 text-gray-600 border-gray-200",
  expired: "bg-gray-100 text-gray-600 border-gray-200",
};

const btn = "min-h-10 inline-flex items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-semibold border transition-colors disabled:opacity-60";
const ghost = `${btn} border-[#e8e6e0] bg-white hover:bg-[#f8f7f4] text-[#0f0f1a]`;
const primary = `${btn} border-transparent bg-sky-600 hover:bg-sky-700 text-white`;

async function call(url: string, init?: RequestInit): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  try {
    const res = await fetch(url, init);
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, data };
  } catch {
    return { ok: false, data: { error: "We could not reach the server. Please try again." } };
  }
}

export function StatusChip({ status, label }: { status: string; label: string }) {
  return <span className={cn("text-xs font-semibold rounded-full border px-2.5 py-1 whitespace-nowrap", CHIP[status] ?? CHIP.expired)}>{label}</span>;
}

/** One booking: the facts, and the actions the customer may take on it (join, track, reschedule, cancel, book again). */
export function BookingCard({ b, highlight = false }: { b: BookingView; highlight?: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<null | "reschedule" | "cancel">(null);
  const live = ["confirmed", "pending"].includes(b.status);
  const canManage = b.manage.ok;

  return (
    <li className={cn("bg-white rounded-2xl border p-4 sm:p-5", highlight ? "border-sky-200 shadow-[0_12px_32px_-20px_rgba(2,132,199,.6)]" : "border-[#e8e6e0]")}>
      <div className="flex items-start gap-3">
        <span className="h-11 w-11 shrink-0 rounded-xl bg-sky-50 text-sky-700 font-bold grid place-items-center" aria-hidden>{b.businessName.charAt(0).toUpperCase()}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold truncate">{b.serviceName}</p>
              <p className="text-sm text-[#6b6b80] truncate">{b.businessName}</p>
            </div>
            <StatusChip status={b.status} label={b.statusLabel} />
          </div>

          <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
            <div className="flex items-center gap-2"><CalendarClock size={15} className="text-[#6b6b80] shrink-0" aria-hidden /><dt className="sr-only">When</dt><dd>{b.dateLabel} · {b.timeLabel}</dd></div>
            <div className="flex items-center gap-2"><Clock size={15} className="text-[#6b6b80] shrink-0" aria-hidden /><dt className="sr-only">Duration and price</dt><dd>{b.durationMin} min · {b.priceLabel}{b.paid ? " · Paid" : ""}</dd></div>
            {b.staffName && <div className="flex items-center gap-2"><UserRound size={15} className="text-[#6b6b80] shrink-0" aria-hidden /><dt className="sr-only">With</dt><dd>With {b.staffName}</dd></div>}
            {b.online && <div className="flex items-center gap-2 text-sky-700"><Video size={15} className="shrink-0" aria-hidden /><dt className="sr-only">Format</dt><dd>Online consultation</dd></div>}
          </dl>
          {b.forName && b.forName !== "" && <p className="mt-1.5 text-xs text-[#6b6b80]">For {b.forName}</p>}

          <div className="mt-4 flex flex-wrap gap-2">
            {live && b.online && (b.meetingUrl
              ? <a href={b.meetingUrl} target="_blank" rel="noopener noreferrer" className={primary}><Video size={15} aria-hidden />Join online</a>
              : <span className={`${btn} border-amber-200 bg-amber-50 text-amber-700 cursor-default`}>Link coming soon</span>)}
            {live && b.trackUrl && <Link href={b.trackUrl} className={ghost}><ListOrdered size={15} aria-hidden />Track queue</Link>}
            {live && canManage && (
              <>
                {!b.moveBlocked && <button type="button" className={ghost} onClick={() => setMode("reschedule")}><RefreshCw size={15} aria-hidden />{b.tokenNumber ? "Move to another day" : "Reschedule"}</button>}
                <button type="button" className={`${ghost} text-red-700 hover:bg-red-50`} onClick={() => setMode("cancel")}><XCircle size={15} aria-hidden />Cancel</button>
              </>
            )}
            {b.reviewUrl && <a href={b.reviewUrl} target="_blank" rel="noopener noreferrer" className={primary}><Star size={15} aria-hidden />Review us on Google</a>}
            {!live && <Link href={b.bookAgainHref} className={ghost}><Repeat size={15} aria-hidden />Book again</Link>}
          </div>
          {live && canManage && b.moveBlocked && <p className="mt-3 text-xs text-[#6b6b80]">{b.moveBlocked}</p>}
          {live && !b.manage.ok && (
            <p className="mt-3 text-xs text-[#6b6b80]">
              {b.manage.reason}{" "}
              {b.businessPhone && <a href={`tel:${b.businessPhone}`} className="inline-flex items-center gap-1 font-semibold text-sky-700 hover:underline"><Phone size={12} aria-hidden />{b.businessPhone}</a>}
            </p>
          )}
        </div>
      </div>

      {mode === "reschedule" && b.tokenNumber && <TokenMoveModal b={b} onClose={() => setMode(null)} onDone={() => { setMode(null); router.refresh(); }} />}
      {mode === "reschedule" && !b.tokenNumber && <RescheduleModal b={b} onClose={() => setMode(null)} onDone={() => { setMode(null); router.refresh(); }} />}
      {mode === "cancel" && <CancelModal b={b} onClose={() => setMode(null)} onDone={() => { setMode(null); router.refresh(); }} />}
    </li>
  );
}

function RescheduleModal({ b, onClose, onDone }: { b: BookingView; onClose: () => void; onDone: () => void }) {
  const [date, setDate] = useState(b.dateInput < b.today ? b.today : b.dateInput);
  const [times, setTimes] = useState<string[] | null>(null);
  const [time, setTime] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loadedFor, setLoadedFor] = useState("");

  async function load(d: string) {
    setDate(d); setTime(""); setError(""); setTimes(null);
    if (!d) return;
    setLoading(true);
    const r = await call(`/api/customer/appointments/${b.id}/slots?date=${d}`);
    setLoading(false);
    setLoadedFor(d);
    if (!r.ok) { setError(String(r.data.error ?? "Could not load times.")); setTimes([]); return; }
    setTimes(((r.data.times as { time: string }[]) ?? []).map((t) => t.time));
  }

  async function save() {
    setSaving(true); setError("");
    const r = await call(`/api/customer/appointments/${b.id}/reschedule`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date, time }),
    });
    setSaving(false);
    if (!r.ok) { setError(String(r.data.error ?? "Could not reschedule.")); return; }
    onDone();
  }

  return (
    <Modal isOpen onClose={onClose} title="Reschedule" size="md">
      <div className="space-y-4">
        <p className="text-sm text-[#6b6b80]">{b.serviceName} at {b.businessName}. Now: <strong className="text-[#0f0f1a]">{b.dateLabel}, {b.timeLabel}</strong></p>
        <div>
          <label htmlFor={`rs-date-${b.id}`} className="text-sm font-medium block mb-1.5">Pick a new date</label>
          <input id={`rs-date-${b.id}`} type="date" min={b.today} value={date} onChange={(e) => load(e.target.value)}
            className="w-full min-h-11 rounded-xl border border-[#e8e6e0] bg-white px-4 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-500" />
        </div>
        <div aria-live="polite">
          {loading && <p className="text-sm text-[#6b6b80]">Loading times…</p>}
          {!loading && times && times.length === 0 && !error && loadedFor === date && <p className="text-sm text-[#6b6b80]">No free times on this day. Try another date.</p>}
          {!loading && times && times.length > 0 && (
            <div role="radiogroup" aria-label="Available times" className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-56 overflow-y-auto">
              {times.map((t) => (
                <button key={t} type="button" role="radio" aria-checked={time === t} onClick={() => setTime(t)}
                  className={cn("min-h-10 rounded-xl border text-sm font-medium", time === t ? "bg-sky-600 text-white border-sky-600" : "bg-white border-[#e8e6e0] hover:border-sky-400")}>{t}</button>
              ))}
            </div>
          )}
          {!times && !loading && <p className="text-sm text-[#6b6b80]">Choose a date to see the free times.</p>}
        </div>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <p className="text-xs text-[#6b6b80]">{b.businessName} is told straight away, and we email you the new time.</p>
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className={`${ghost} flex-1`}>Keep as is</button>
          <button type="button" onClick={save} disabled={!time || saving} className={`${primary} flex-1`}>{saving ? "Moving…" : "Confirm new time"}</button>
        </div>
      </div>
    </Modal>
  );
}

interface SessionOption { id: string; name: string; staffName: string | null; startTime: string; endTime: string; left: number }

/** A queue token moves to another day: pick a date, then a session; it joins the end of that queue. */
function TokenMoveModal({ b, onClose, onDone }: { b: BookingView; onClose: () => void; onDone: () => void }) {
  const [date, setDate] = useState("");
  const [sessions, setSessions] = useState<SessionOption[] | null>(null);
  const [sessionId, setSessionId] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load(d: string) {
    setDate(d); setSessionId(""); setError(""); setSessions(null);
    if (!d) return;
    if (d === b.dateInput) { setError("That is the day you already have. Pick another day."); return; }
    setLoading(true);
    const r = await call(`/api/customer/appointments/${b.id}/slots?date=${d}`);
    setLoading(false);
    if (!r.ok) { setError(String(r.data.error ?? "Could not load sessions.")); setSessions([]); return; }
    const list = (r.data.sessions as SessionOption[]) ?? [];
    setSessions(list);
    if (list.length === 1) setSessionId(list[0].id);
  }

  async function save() {
    setSaving(true); setError("");
    const r = await call(`/api/customer/appointments/${b.id}/reschedule`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date, tokenSessionId: sessionId }),
    });
    setSaving(false);
    if (!r.ok) { setError(String(r.data.error ?? "Could not move the token.")); return; }
    onDone();
  }

  return (
    <Modal isOpen onClose={onClose} title="Move to another day" size="md">
      <div className="space-y-4">
        <p className="text-sm text-[#6b6b80]">{b.serviceName} at {b.businessName}. Now: <strong className="text-[#0f0f1a]">{b.dateLabel}, {b.timeLabel}</strong></p>
        <p className="text-sm text-[#6b6b80]">You get a new token at the end of that day&apos;s queue. Your booking{b.paid ? " and payment" : ""} stay the same. A token can be moved once.</p>
        <div>
          <label htmlFor={`tm-date-${b.id}`} className="text-sm font-medium block mb-1.5">Pick a new day</label>
          <input id={`tm-date-${b.id}`} type="date" min={b.today} value={date} onChange={(e) => load(e.target.value)}
            className="w-full min-h-11 rounded-xl border border-[#e8e6e0] bg-white px-4 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-500" />
        </div>
        <div aria-live="polite">
          {loading && <p className="text-sm text-[#6b6b80]">Loading sessions…</p>}
          {!loading && sessions && sessions.length === 0 && !error && <p className="text-sm text-[#6b6b80]">No session with free tokens on this day. Try another day.</p>}
          {!loading && sessions && sessions.length > 0 && (
            <div role="radiogroup" aria-label="Sessions" className="space-y-2">
              {sessions.map((s) => (
                <button key={s.id} type="button" role="radio" aria-checked={sessionId === s.id} onClick={() => setSessionId(s.id)}
                  className={cn("w-full min-h-11 rounded-xl border px-4 py-2 text-left text-sm", sessionId === s.id ? "bg-sky-600 text-white border-sky-600" : "bg-white border-[#e8e6e0] hover:border-sky-400")}>
                  <span className="font-semibold">{s.name}</span> · {s.startTime}–{s.endTime}{s.staffName ? ` · ${s.staffName}` : ""}
                  <span className={cn("block text-xs", sessionId === s.id ? "text-sky-100" : "text-[#6b6b80]")}>{s.left} token{s.left === 1 ? "" : "s"} left</span>
                </button>
              ))}
            </div>
          )}
          {!date && <p className="text-sm text-[#6b6b80]">Choose a day to see its sessions.</p>}
        </div>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <p className="text-xs text-[#6b6b80]">{b.businessName} is told straight away, and we email you the new token.</p>
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className={`${ghost} flex-1`}>Keep as is</button>
          <button type="button" onClick={save} disabled={!sessionId || saving} className={`${primary} flex-1`}>{saving ? "Moving…" : "Move my token"}</button>
        </div>
      </div>
    </Modal>
  );
}

function CancelModal({ b, onClose, onDone }: { b: BookingView; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function cancel() {
    setBusy(true); setError("");
    const r = await call(`/api/customer/appointments/${b.id}/cancel`, { method: "POST" });
    setBusy(false);
    if (!r.ok) { setError(String(r.data.error ?? "Could not cancel.")); return; }
    onDone();
  }

  return (
    <Modal isOpen onClose={onClose} title="Cancel this booking?" size="sm">
      <div className="space-y-4">
        <p className="text-sm">{b.serviceName} at <strong>{b.businessName}</strong><br />{b.dateLabel}, {b.timeLabel}</p>
        <p className="text-xs text-[#6b6b80]">{b.businessName} is told straight away and we email you a confirmation. If you paid online, the amount is saved as credit for your next booking there.</p>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className={`${ghost} flex-1`}>Keep booking</button>
          <button type="button" onClick={cancel} disabled={busy} className={`${btn} flex-1 border-transparent bg-red-600 hover:bg-red-700 text-white`}>{busy ? "Cancelling…" : "Yes, cancel"}</button>
        </div>
      </div>
    </Modal>
  );
}
