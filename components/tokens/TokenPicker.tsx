"use client";
import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TokenOption {
  id: string; name: string; staffId: string | null; staffName: string | null;
  startTime: string; endTime: string; minutesPerToken: number; capacity: number; left: number;
}

const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * Public booking step for queue (token) businesses: pick a date, then a session. Styled by the
 * booking page's `bk-*` classes, so it is only used inside that page. Customers never see the word
 * "token": it is a number in the queue with an estimated time.
 */
export function TokenPicker({ slug, serviceIds, date, selectedId, onPick, heldSessions, staffWord, appointmentWord }: {
  slug: string; serviceIds: string[]; date: string; selectedId: string | null;
  onPick: (date: string, option: TokenOption | null) => void;
  /** Session id -> "Token #5": sessions in which the booker already holds a token for themselves. */
  heldSessions?: Record<string, string>;
  staffWord: string; appointmentWord: string;
  /** Kept so callers need not change; colours now come from the page's brand variables. */
  color?: string; fg?: string;
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
    <section className="bk-step">
      <h2>Pick a date &amp; session</h2>
      <p className="bk-sub">You will get a number in the queue and an estimated time for your {appointmentWord}.</p>
      <div className="bk-card">
        <div className="bk-field">
          <label htmlFor="token-date">Date</label>
          <input id="token-date" type="date" min={localToday()} value={date} onChange={(e) => onPick(e.target.value, null)} className="bk-input" style={{ maxWidth: 260 }} />
        </div>
      </div>

      {date && !ready && <div className="bk-center"><Loader2 size={18} className="animate-spin" style={{ display: "inline", marginRight: 8 }} aria-hidden /> Loading sessions…</div>}
      {ready?.error && <p role="alert" className="bk-note err">{ready.error}</p>}

      {ready && !ready.error && ready.sessions.length === 0 && (
        <div className="bk-card st-muted" style={{ fontSize: "0.9375rem" }}>
          No sessions on this date.
          {ready.next && <> Next available: <button type="button" style={{ fontWeight: 600, textDecoration: "underline", background: "none", border: 0, cursor: "pointer", color: "var(--ink)", font: "inherit" }} onClick={() => onPick(ready.next!.date, null)}>{ready.next.date}, {ready.next.sessionName}</button>.</>}
        </div>
      )}

      {ready && ready.sessions.length > 0 && (
        <div role="radiogroup" aria-label="Sessions">
          {ready.sessions.map((s) => {
            const held = heldSessions?.[s.id];
            const full = s.left <= 0 || !!held;
            const on = selectedId === s.id;
            return (
              <button
                key={s.id} type="button" role="radio" aria-checked={on} disabled={full}
                onClick={() => onPick(date, s)}
                className={cn("bk-opt", on && "sel")}
              >
                <span className="bk-tick round" aria-hidden><Check size={14} strokeWidth={3} /></span>
                <span className="bk-opt-title">{s.name}</span>
                <span className="bk-opt-right" style={{ fontSize: "0.875rem", color: full ? "#b91c1c" : "#166534" }}>
                  {held ? `You already have ${held}` : full ? "Full" : `${s.left} places left`}
                </span>
                <span className="bk-opt-sub">
                  {s.startTime} – {s.endTime}{multiQueue && s.staffName ? ` · ${s.staffName}` : ""}
                </span>
              </button>
            );
          })}
          {multiQueue && <p className="st-muted" style={{ fontSize: "0.8125rem", paddingTop: 4 }}>Each {staffWord} has their own queue and numbers.</p>}
        </div>
      )}
    </section>
  );
}
