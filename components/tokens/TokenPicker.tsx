"use client";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TokenOption {
  id: string; name: string; staffId: string | null; staffName: string | null;
  startTime: string; endTime: string; minutesPerToken: number; capacity: number; left: number;
}

const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Public booking step for token businesses: pick a date, then a session ("~N left"). */
export function TokenPicker({ slug, serviceIds, date, selectedId, onPick, staffWord, appointmentWord, color, fg }: {
  slug: string; serviceIds: string[]; date: string; selectedId: string | null;
  onPick: (date: string, option: TokenOption | null) => void;
  staffWord: string; appointmentWord: string; color: string; fg: string;
}) {
  const [state, setState] = useState<{ key: string; sessions: TokenOption[]; next: { date: string; sessionName: string } | null; error: string } | null>(null);
  const key = `${slug}|${date}|${serviceIds.join(",")}`;

  useEffect(() => {
    if (!date) return;
    let cancelled = false;
    fetch(`/api/token-availability?slug=${encodeURIComponent(slug)}&date=${date}&serviceIds=${serviceIds.join(",")}`)
      .then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => ({})) }))
      .then(({ ok, data }) => {
        if (cancelled) return;
        setState({ key, sessions: ok ? data.sessions ?? [] : [], next: ok ? data.nextAvailable ?? null : null, error: ok ? "" : data.error ?? "Could not load sessions." });
      })
      .catch(() => { if (!cancelled) setState({ key, sessions: [], next: null, error: "Network error. Please try again." }); });
    return () => { cancelled = true; };
  }, [key, slug, date, serviceIds]);

  const ready = state?.key === key ? state : null;
  const multiQueue = new Set(ready?.sessions.map((s) => s.staffId)).size > 1 || !!ready?.sessions.some((s) => s.staffId);

  return (
    <div>
      <h2 className="font-syne font-bold text-2xl mb-2">Pick a date & session</h2>
      <p className="text-[#6b6b80] mb-6">You will get a token number and an estimated time for your {appointmentWord}.</p>
      <div className="bg-white rounded-2xl border border-[#e8e6e0] p-5 mb-4">
        <label htmlFor="token-date" className="text-sm font-medium block mb-1.5">Date</label>
        <input
          id="token-date" type="date" min={localToday()} value={date}
          onChange={(e) => onPick(e.target.value, null)}
          className="w-full sm:w-60 rounded-xl border border-[#e8e6e0] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20"
        />
      </div>

      {date && !ready && <div className="flex items-center gap-2 text-sm text-[#6b6b80]"><Loader2 size={16} className="animate-spin" /> Loading sessions…</div>}
      {ready?.error && <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{ready.error}</p>}

      {ready && !ready.error && ready.sessions.length === 0 && (
        <div className="text-sm text-[#6b6b80] bg-white rounded-2xl border border-[#e8e6e0] p-5">
          No sessions on this date.
          {ready.next && <> Next available: <button type="button" className="font-semibold underline" onClick={() => onPick(ready.next!.date, null)}>{ready.next.date}, {ready.next.sessionName}</button>.</>}
        </div>
      )}

      {ready && ready.sessions.length > 0 && (
        <div className="space-y-2" role="radiogroup" aria-label="Sessions">
          {ready.sessions.map((s) => {
            const full = s.left <= 0;
            const on = selectedId === s.id;
            return (
              <button
                key={s.id} type="button" role="radio" aria-checked={on} disabled={full}
                onClick={() => onPick(date, s)}
                className={cn(
                  "w-full text-left rounded-2xl border p-4 transition-colors flex items-center justify-between gap-3",
                  full ? "opacity-50 cursor-not-allowed border-[#e8e6e0] bg-white" : on ? "border-transparent" : "border-[#e8e6e0] bg-white hover:border-[#0f0f1a]/40",
                )}
                style={on ? { background: color, color: fg } : undefined}
              >
                <div>
                  <div className="font-semibold">{s.name}</div>
                  <div className={cn("text-xs", on ? "opacity-80" : "text-[#6b6b80]")}>
                    {s.startTime} – {s.endTime}{multiQueue && s.staffName ? ` · ${s.staffName}` : ""}
                  </div>
                </div>
                <div className={cn("text-sm font-medium whitespace-nowrap", !on && (full ? "text-red-600" : "text-green-700"))}>
                  {full ? "Full" : `~${s.left} left`}
                </div>
              </button>
            );
          })}
          {multiQueue && <p className="text-xs text-[#6b6b80] pt-1">Each {staffWord} has their own queue and token numbers.</p>}
        </div>
      )}
    </div>
  );
}
