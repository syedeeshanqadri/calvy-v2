"use client";
import { OnlineBadge, JoinButton } from "@/components/dashboard/OnlineJoin";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Phone, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTerms } from "@/components/providers/TermsProvider";
import type { QueueRow, QueueSessionInfo, QueueView } from "@/lib/queueDb";

type Payload = { key: string; sessions: QueueSessionInfo[]; queue: QueueView | null; error: string };

const POLL_MS = 10_000;
const bigBtn = "w-full min-h-14 rounded-2xl text-base font-semibold px-4 transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

/** Reception queue: touch-friendly, works at 375px. */
export function QueueClient({ today, services, whatsappOffered = false }: { today: string; services: { id: string; name: string }[]; whatsappOffered?: boolean }) {
  const { t } = useTerms();
  const appt = t("appointment"), client = t("client");
  const [date, setDate] = useState(today);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [data, setData] = useState<Payload | null>(null);
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [walkOpen, setWalkOpen] = useState(false);
  const [walk, setWalk] = useState({ name: "", phone: "", serviceId: services[0]?.id ?? "" });
  const [walkWa, setWalkWa] = useState(false); // never pre-ticked: only when the customer agreed at the desk

  const key = `${date}|${sessionId ?? ""}|${tick}`;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/queue?date=${date}${sessionId ? `&sessionId=${sessionId}` : ""}`)
      .then(async (r) => ({ ok: r.ok, body: await r.json().catch(() => ({})) }))
      .then(({ ok, body }) => {
        if (cancelled) return;
        setData({ key, sessions: ok ? body.sessions ?? [] : [], queue: ok ? body.queue ?? null : null, error: ok ? "" : body.error ?? "Could not load the queue." });
      })
      .catch(() => { if (!cancelled) setData({ key, sessions: [], queue: null, error: "Network error. Retrying…" }); });
    return () => { cancelled = true; };
  }, [key, date, sessionId]);

  // Live updates: other staff and online bookings change the queue.
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), POLL_MS);
    return () => clearInterval(id);
  }, []);

  const refresh = useCallback(() => setTick((n) => n + 1), []);
  const sessions = data?.sessions ?? [];
  const queue = data?.queue ?? null;
  const loading = !data;
  const serving = queue?.open.find((r) => r.state === "SERVING") ?? null;
  const waiting = queue?.open.filter((r) => r.state !== "SERVING") ?? [];

  async function post(url: string, body: unknown, ok: (d: Record<string, unknown>) => string) {
    setBusy(true); setError(""); setMessage("");
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Something went wrong.");
      setMessage(ok(d));
      refresh();
      return true;
    } catch (e) {
      setError((e as Error).message);
      refresh();
      return false;
    } finally {
      setBusy(false);
    }
  }

  const act = (action: "next" | "not_present" | "not_coming", row?: QueueRow) =>
    post("/api/queue/action", { sessionId: queue!.session.id, date, action, appointmentId: row?.id }, (d) => String(d.message ?? "Done."));

  function notComing(row: QueueRow) {
    const text = `Cancel token ${row.tokenNumber} (${row.clientName})? Whatever they paid online is saved in their wallet for a future booking. Nothing is refunded automatically.`;
    if (window.confirm(text)) void act("not_coming", row);
  }

  async function addWalkIn(e: React.FormEvent) {
    e.preventDefault();
    if (!queue) return;
    const done = await post("/api/queue/walk-in", { sessionId: queue.session.id, date, name: walk.name, phone: walk.phone, serviceId: walk.serviceId || undefined, ...(whatsappOffered && walkWa ? { whatsappConsent: true } : {}) },
      (d) => `Walk-in added: token ${d.tokenNumber} for ${walk.name.trim()}, estimated around ${d.etaTime}.`);
    if (done) { setWalk((w) => ({ ...w, name: "", phone: "" })); setWalkWa(false); setWalkOpen(false); }
  }

  return (
    <div className="max-w-2xl space-y-4">
      {/* Date + session */}
      <div className="bg-white rounded-2xl border border-[#e8e6e0] p-4 space-y-3">
        <div>
          <label htmlFor="queue-date" className="text-sm font-medium block mb-1.5">Date</label>
          <input id="queue-date" type="date" value={date} onChange={(e) => { setDate(e.target.value); setSessionId(null); setData(null); }}
            className="w-full sm:w-56 min-h-11 rounded-xl border border-[#e8e6e0] px-3 text-sm" />
        </div>
        {sessions.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Sessions">
            {sessions.map((s) => {
              const on = queue?.session.id === s.id;
              return (
                <button key={s.id} type="button" role="tab" aria-selected={on} onClick={() => { setSessionId(s.id); setData(null); }}
                  className={cn("shrink-0 min-h-14 rounded-2xl border px-4 text-left", on ? "bg-[#0f0f1a] text-white border-[#0f0f1a]" : "bg-white border-[#e8e6e0]")}>
                  <div className="text-sm font-semibold">{s.name}{s.staffName ? ` · ${s.staffName}` : ""}</div>
                  <div className={cn("text-xs", on ? "opacity-80" : "text-[#6b6b80]")}>{s.startTime}–{s.endTime} · {s.open} waiting · {s.issued}/{s.capacity} issued</div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {error && <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{error}</p>}
      {message && !error && <p role="status" className="text-sm text-green-800 bg-green-50 rounded-xl px-4 py-3">{message}</p>}
      {data?.error && <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{data.error}</p>}

      {loading && <div className="flex items-center gap-2 text-sm text-[#6b6b80]"><Loader2 size={16} className="animate-spin" /> Loading the queue…</div>}
      {!loading && !data?.error && sessions.length === 0 && (
        <p className="text-sm text-[#6b6b80] bg-white rounded-2xl border border-[#e8e6e0] p-5">No token sessions run on this date. Add sessions in Settings → Booking.</p>
      )}

      {queue && (
        <>
          {/* Now serving */}
          <section aria-label="Now serving" className="bg-white rounded-2xl border border-[#e8e6e0] p-5 space-y-4">
            <p className="text-xs font-bold tracking-wider uppercase text-[#6b6b80]">Now serving</p>
            {serving ? (
              <>
                <div className="flex items-center gap-4">
                  <div className="text-5xl font-bold font-syne tabular-nums">#{serving.tokenNumber}</div>
                  <div className="min-w-0">
                    <div className="text-lg font-semibold truncate">{serving.clientName}</div>
                    <div className="text-sm text-[#6b6b80] truncate">{serving.serviceName}</div>
                    {serving.isOnline && <div className="flex items-center gap-2 mt-1"><OnlineBadge /><JoinButton url={serving.meetingUrl} size="md" /></div>}
                    {serving.clientPhone && (
                      <a href={`tel:${serving.clientPhone}`} className="inline-flex items-center gap-1 text-sm text-sky-700 min-h-11"><Phone size={14} />{serving.clientPhone}</a>
                    )}
                  </div>
                </div>
                <button type="button" disabled={busy} onClick={() => act("next")} className={cn(bigBtn, "bg-[#0f0f1a] text-white hover:bg-[#1a1a2e]")}>
                  {busy ? "Working…" : waiting.length ? `Done · call next (#${waiting[0].tokenNumber})` : "Done"}
                </button>
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" disabled={busy} onClick={() => act("not_present", serving)} className={cn(bigBtn, "border border-amber-300 bg-amber-50 text-amber-900")}>Not present</button>
                  <button type="button" disabled={busy} onClick={() => notComing(serving)} className={cn(bigBtn, "border border-[#e8e6e0] bg-white")}>Cancel (not coming)</button>
                </div>
              </>
            ) : waiting.length > 0 ? (
              <>
                <p className="text-sm text-[#6b6b80]">Nobody is being served.</p>
                <button type="button" disabled={busy} onClick={() => act("next")} className={cn(bigBtn, "bg-[#0f0f1a] text-white hover:bg-[#1a1a2e]")}>
                  Call {client} #{waiting[0].tokenNumber} · {waiting[0].clientName}
                </button>
              </>
            ) : (
              <p className="text-sm text-[#6b6b80]">No one is waiting.</p>
            )}
          </section>

          {/* Waiting */}
          <section aria-label="Waiting" className="bg-white rounded-2xl border border-[#e8e6e0] p-5 space-y-3">
            <p className="text-xs font-bold tracking-wider uppercase text-[#6b6b80]">Waiting ({waiting.length})</p>
            {waiting.length === 0 && <p className="text-sm text-[#6b6b80]">The waiting list is empty.</p>}
            <ul className="divide-y divide-[#f0ede8]">
              {waiting.map((r) => (
                <li key={r.id} className="py-3 flex items-center gap-3">
                  <div className="w-14 shrink-0 text-center">
                    <div className="text-xl font-bold tabular-nums">#{r.tokenNumber}</div>
                    <div className="text-xs text-[#6b6b80]">{r.etaTime}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{r.clientName}</div>
                    <div className="text-xs text-[#6b6b80] truncate">
                      {r.serviceName}
                      {r.source === "WALK_IN" && " · Walk-in"}
                      {r.isOnline && <span className="ml-1.5 inline-flex items-center gap-1.5 align-middle"><OnlineBadge /><JoinButton url={r.meetingUrl} /></span>}
                      {r.carried && " · Moved from earlier"}
                      {r.notPresentCount > 0 && ` · Missed ${r.notPresentCount} of 4 calls`}
                    </div>
                  </div>
                  <button type="button" disabled={busy} onClick={() => notComing(r)} className="shrink-0 min-h-11 px-3 rounded-xl border border-[#e8e6e0] text-sm">Not coming</button>
                </li>
              ))}
            </ul>
          </section>

          {/* Walk-in */}
          <section aria-label="Walk-in" className="bg-white rounded-2xl border border-[#e8e6e0] p-5 space-y-3">
            {!walkOpen ? (
              <button type="button" onClick={() => setWalkOpen(true)} className={cn(bigBtn, "border border-[#0f0f1a] flex items-center justify-center gap-2")}>
                <UserPlus size={18} /> Add walk-in
              </button>
            ) : (
              <form onSubmit={addWalkIn} className="space-y-3">
                <p className="font-semibold">Walk-in {client}</p>
                <label className="block text-sm">Name
                  <input required value={walk.name} maxLength={120} onChange={(e) => setWalk({ ...walk, name: e.target.value })} className="mt-1 w-full min-h-12 rounded-xl border border-[#e8e6e0] px-3 text-base" />
                </label>
                <label className="block text-sm">Phone
                  <input required type="tel" inputMode="tel" value={walk.phone} onChange={(e) => setWalk({ ...walk, phone: e.target.value })} placeholder="+91 98765 43210" className="mt-1 w-full min-h-12 rounded-xl border border-[#e8e6e0] px-3 text-base" />
                </label>
                {services.length > 1 && (
                  <label className="block text-sm">{t("service", { cap: true })}
                    <select value={walk.serviceId} onChange={(e) => setWalk({ ...walk, serviceId: e.target.value })} className="mt-1 w-full min-h-12 rounded-xl border border-[#e8e6e0] px-3 text-base bg-white">
                      {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </label>
                )}
                {whatsappOffered && (
                  <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" checked={walkWa} onChange={(e) => setWalkWa(e.target.checked)} className="mt-1 size-5" />
                    <span>Send WhatsApp updates <span className="text-[#6b6b80]">(customer agreed verbally)</span></span>
                  </label>
                )}
                <p className="text-xs text-[#6b6b80]">No email needed and no fee. They go to the end of the queue.</p>
                <div className="grid grid-cols-2 gap-3">
                  <button type="submit" disabled={busy || !walk.name.trim() || !walk.phone.trim()} className={cn(bigBtn, "bg-[#0f0f1a] text-white")}>{busy ? "Adding…" : "Add token"}</button>
                  <button type="button" disabled={busy} onClick={() => setWalkOpen(false)} className={cn(bigBtn, "border border-[#e8e6e0]")}>Cancel</button>
                </div>
              </form>
            )}
          </section>

          {/* Closed */}
          {queue.closed.length > 0 && (
            <details className="bg-white rounded-2xl border border-[#e8e6e0] p-5">
              <summary className="cursor-pointer text-sm font-semibold min-h-11 flex items-center">Closed today ({queue.closed.length}) <span className="sr-only"> {appt}s</span></summary>
              <ul className="mt-2 divide-y divide-[#f0ede8] text-sm">
                {queue.closed.map((r) => (
                  <li key={r.id} className="py-2 flex justify-between gap-3">
                    <span className="truncate">#{r.tokenNumber} {r.clientName}</span>
                    <span className="text-[#6b6b80] shrink-0">{r.state === "DONE" ? "Done" : r.state === "NO_SHOW" ? "Missed" : r.state === "CANCELLED" ? "Cancelled" : "Moved"}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}
