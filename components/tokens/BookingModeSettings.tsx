"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { dayCapacity, describeSession, hhmmToMin, sessionCapacity, type SessionLike } from "@/lib/tokens";

export interface TokenSessionRow {
  id: string; name: string; staffId: string | null; weekdays: number[];
  startTime: string; endTime: string; minutesPerToken: number; isActive: boolean;
}
type Mode = "SLOT" | "TOKEN";
type Draft = Omit<TokenSessionRow, "id"> & { id?: string };

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const field = "w-full rounded-xl border border-[#e8e6e0] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20";
const blank = (): Draft => ({ name: "", staffId: null, weekdays: [1, 2, 3, 4, 5], startTime: "10:00", endTime: "14:00", minutesPerToken: 15, isActive: true });

const toLike = (d: Draft): SessionLike => ({
  id: d.id, name: d.name || "Session", staffId: d.staffId, weekdays: d.weekdays,
  startMin: hhmmToMin(d.startTime), endMin: hhmmToMin(d.endTime), minutesPerToken: d.minutesPerToken, isActive: d.isActive,
});

/** Settings card: Time slots vs Tokens, plus the token sessions editor with live capacity. */
export function BookingModeSettings({ initialMode, initialSessions, staff, appointmentWord }: {
  initialMode: Mode; initialSessions: TokenSessionRow[]; staff: { id: string; name: string }[]; appointmentWord: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [sessions, setSessions] = useState<TokenSessionRow[]>(initialSessions);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const unit = `${appointmentWord}s`;
  const staffName = (id: string | null) => (id ? staff.find((s) => s.id === id)?.name ?? "Unknown" : "Whole business");
  const likes = sessions.map(toLike);
  const todayDow = new Date().getDay();

  async function call(url: string, method: string, body?: unknown) {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Could not save. Try again.");
    return data;
  }

  async function changeMode(next: Mode) {
    setBusy(true); setError(""); setMessage("");
    try {
      await call("/api/settings/booking-mode", "POST", { bookingMode: next });
      setMode(next);
      setMessage(next === "TOKEN" ? "Token booking is on." : "Time-slot booking is on.");
      router.refresh();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function saveDraft() {
    if (!draft) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const { id, ...body } = draft;
      const data = await call(id ? `/api/settings/token-sessions/${id}` : "/api/settings/token-sessions", id ? "PUT" : "POST", body);
      const row: TokenSessionRow = data.session;
      setSessions((prev) => (id ? prev.map((s) => (s.id === id ? row : s)) : [...prev, row]).sort((a, b) => a.startTime.localeCompare(b.startTime)));
      setDraft(null);
      setMessage("Session saved.");
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this session?")) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await call(`/api/settings/token-sessions/${id}`, "DELETE");
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  const previewCap = draft ? sessionCapacity(toLike(draft)) : 0;

  return (
    <div className="space-y-5">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-brand-800 mb-1">Booking mode</legend>
        {([
          ["SLOT", "Time slots", `Customers pick an exact time for their ${appointmentWord}.`],
          ["TOKEN", "Tokens", `Customers pick a day and session and get a token number; ${unit} are seen in order.`],
        ] as const).map(([value, label, hint]) => (
          <label key={value} className="flex items-start gap-2 text-sm">
            <input type="radio" name="booking-mode" className="mt-1" checked={mode === value} disabled={busy} onChange={() => changeMode(value)} />
            <span><span className="font-medium">{label}</span><span className="block text-xs text-[#6b6b80]">{hint}</span></span>
          </label>
        ))}
      </fieldset>

      {mode === "TOKEN" && (
        <div className="space-y-3">
          <div className="text-sm font-medium text-brand-800">Token sessions</div>
          <p className="text-xs text-[#6b6b80]">
            Use either one business-wide queue or a queue per staff member, not both. Each staff member&apos;s sessions cannot overlap; different staff can share the same hours.
          </p>
          {sessions.length === 0 && !draft && <p className="text-sm text-[#6b6b80]">No sessions yet. Add one to start taking tokens.</p>}
          <ul className="space-y-2">
            {sessions.map((s) => (
              <li key={s.id} className="rounded-xl border border-[#e8e6e0] p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-medium">{describeSession(toLike(s), unit)}{!s.isActive && <span className="ml-2 text-xs text-[#6b6b80]">(inactive)</span>}</div>
                    <div className="text-xs text-[#6b6b80]">{staffName(s.staffId)} · {s.weekdays.map((d) => DAYS[d]).join(", ")}</div>
                  </div>
                  <div className="flex gap-3 text-xs">
                    <button type="button" className="text-accent hover:underline" disabled={busy} onClick={() => { setDraft(s); setError(""); }}>Edit</button>
                    <button type="button" className="text-red-600 hover:underline" disabled={busy} onClick={() => remove(s.id)}>Delete</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {sessions.some((s) => s.isActive) && (
            <div className="rounded-xl bg-[#f0ede8] p-3 text-xs text-[#374151] space-y-1" aria-live="polite">
              <div className="font-medium">Total today: {dayCapacity(likes, todayDow)} {unit}</div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[#6b6b80]">
                {DAYS.map((d, i) => <span key={d}>{d} {dayCapacity(likes, i)}</span>)}
              </div>
            </div>
          )}

          {draft ? (
            <div className="rounded-xl border border-[#e8e6e0] p-4 space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="text-sm">Name
                  <input className={field} value={draft.name} placeholder="Morning" maxLength={60} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                </label>
                <label className="text-sm">Queue
                  <select className={field} value={draft.staffId ?? ""} onChange={(e) => setDraft({ ...draft, staffId: e.target.value || null })}>
                    <option value="">Whole business (one queue)</option>
                    {staff.map((s) => <option key={s.id} value={s.id}>{s.name} (own queue)</option>)}
                  </select>
                </label>
                <label className="text-sm">Start
                  <input type="time" className={field} value={draft.startTime} onChange={(e) => setDraft({ ...draft, startTime: e.target.value })} />
                </label>
                <label className="text-sm">End
                  <input type="time" className={field} value={draft.endTime} onChange={(e) => setDraft({ ...draft, endTime: e.target.value })} />
                </label>
                <label className="text-sm">Minutes per {appointmentWord}
                  <input type="number" min={1} max={240} className={field} value={draft.minutesPerToken}
                    onChange={(e) => setDraft({ ...draft, minutesPerToken: Math.round(Number(e.target.value)) || 0 })} />
                </label>
                <label className="flex items-center gap-2 text-sm self-end pb-2">
                  <input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} /> Active
                </label>
              </div>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Days">
                {DAYS.map((d, i) => {
                  const on = draft.weekdays.includes(i);
                  return (
                    <button key={d} type="button" aria-pressed={on}
                      onClick={() => setDraft({ ...draft, weekdays: on ? draft.weekdays.filter((x) => x !== i) : [...draft.weekdays, i].sort() })}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${on ? "bg-[#0f0f1a] text-white border-[#0f0f1a]" : "border-[#e8e6e0] text-[#6b6b80]"}`}>{d}</button>
                  );
                })}
              </div>
              <p className="text-xs text-[#6b6b80]" aria-live="polite">
                {previewCap > 0 ? describeSession(toLike(draft), unit) : "Set a valid time range to see capacity."}
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={saveDraft} disabled={busy} className="px-4 py-2 rounded-xl bg-[#0f0f1a] text-white text-sm font-medium disabled:opacity-50">
                  {busy ? "Saving..." : "Save session"}
                </button>
                <button type="button" onClick={() => { setDraft(null); setError(""); }} disabled={busy} className="px-4 py-2 rounded-xl border border-[#e8e6e0] text-sm">Cancel</button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => { setDraft(blank()); setError(""); setMessage(""); }} className="px-4 py-2 rounded-xl border border-[#e8e6e0] text-sm font-medium">
              Add session
            </button>
          )}
        </div>
      )}

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {message && !error && <p role="status" className="text-sm text-green-700">{message}</p>}
    </div>
  );
}
