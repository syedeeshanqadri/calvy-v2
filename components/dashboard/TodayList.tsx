"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Phone, MessageCircle, UserPlus, PhoneCall, UserX, UserCheck } from "lucide-react";
import type { TodayData, TodayRow } from "@/lib/today";

const btn = "inline-flex items-center gap-1.5 min-h-10 px-3 rounded-xl text-xs font-semibold border border-[#e8e6e0] bg-white hover:bg-[#f8f7f4] disabled:opacity-50";

/** The phone-first "Today": next appointments with one-tap Arrived / Completed / No-show, Call next token, call and WhatsApp links. */
export function TodayList({ data, appointmentWord = "appointments" }: { data: TodayData; appointmentWord?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function run(key: string, url: string, init: RequestInit) {
    setBusy(key); setError("");
    try {
      const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setError(d.error ?? "That did not work. Try again.");
      else router.refresh();
    } catch { setError("We could not reach the server. Check your connection."); }
    finally { setBusy(null); }
  }
  const patch = (id: string, status: string) => run(`${id}:${status}`, `/api/appointments/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
  const arrived = (id: string) => run(`${id}:arrived`, `/api/appointments/${id}/arrived`, { method: "POST" });
  const queue = (key: string, r: { sessionId: string; date: string }, action: "next" | "not_present", appointmentId?: string) =>
    run(key, "/api/queue/action", { method: "POST", body: JSON.stringify({ sessionId: r.sessionId, date: r.date, action, ...(appointmentId ? { appointmentId } : {}) }) });

  const sessions = [...new Map(data.rows.filter((r) => r.tokenSessionId && r.sessionDate).map((r) => [r.tokenSessionId as string, { sessionId: r.tokenSessionId as string, date: r.sessionDate as string }])).values()];
  const open = data.rows.filter((r) => r.status === "confirmed" || r.status === "pending");
  const done = data.rows.filter((r) => !open.includes(r));

  const Row = ({ r }: { r: TodayRow }) => {
    const wa = r.phone ? `https://wa.me/${r.phone.replace(/\D/g, "")}` : null;
    const serving = r.queueState === "SERVING";
    return (
      <li className="py-3 border-b border-[#f0ede8] last:border-0" data-testid="today-row">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{r.isToken ? `#${r.tokenNumber} · ` : ""}{r.name}</p>
            <p className="text-xs text-[#6b6b80] truncate">{r.timeLabel} · {r.service}</p>
          </div>
          <div className="text-right text-xs shrink-0">
            {r.arrivedAt ? <span className="text-green-700 font-semibold">{r.isToken ? "Present" : "Arrived"}</span> : r.isToken ? <span className="text-[#6b6b80]">{serving ? "Being served" : (r.queueState ?? "").toLowerCase()}</span> : null}
            {r.status === "completed" && <span className="text-green-700 font-semibold">Done</span>}
            {r.status === "no-show" && <span className="text-red-700 font-semibold">No-show</span>}
          </div>
        </div>
        {(r.status === "confirmed" || r.status === "pending") && (
          <div className="mt-2 flex flex-wrap gap-2">
            {!r.isToken && data.can.write && (
              <>
                {!r.arrivedAt && <button type="button" className={btn} disabled={!!busy} onClick={() => arrived(r.id)}><UserCheck size={14} aria-hidden />Arrived</button>}
                <button type="button" className={btn} disabled={!!busy} onClick={() => patch(r.id, "completed")}><Check size={14} aria-hidden />Completed</button>
                <button type="button" className={`${btn} text-red-700`} disabled={!!busy} onClick={() => patch(r.id, "no-show")}><UserX size={14} aria-hidden />No-show</button>
              </>
            )}
            {r.isToken && serving && data.can.queue && r.tokenSessionId && r.sessionDate && (
              <>
                {!r.arrivedAt && <button type="button" className={btn} disabled={!!busy} onClick={() => arrived(r.id)}><UserCheck size={14} aria-hidden />Present</button>}
                <button type="button" className={`${btn} text-red-700`} disabled={!!busy} onClick={() => queue(`${r.id}:np`, { sessionId: r.tokenSessionId!, date: r.sessionDate! }, "not_present", r.id)}><UserX size={14} aria-hidden />Not present</button>
              </>
            )}
            {r.phone && (
              <>
                <a className={btn} href={`tel:${r.phone}`}><Phone size={14} aria-hidden />Call</a>
                {wa && <a className={btn} href={wa} target="_blank" rel="noopener noreferrer"><MessageCircle size={14} aria-hidden />WhatsApp</a>}
              </>
            )}
          </div>
        )}
      </li>
    );
  };

  return (
    <section aria-labelledby="today-h" className="bg-white rounded-2xl border border-[#e8e6e0] p-4 sm:p-5 mb-6" data-testid="today">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h2 id="today-h" className="font-syne font-semibold text-[15px]">Today</h2>
        <div className="flex gap-2">
          {data.isTokenBusiness && data.can.queue && sessions.map((s, i) => (
            <button key={s.sessionId} type="button" className={`${btn} bg-sky-600 text-white border-sky-600 hover:bg-sky-700`} disabled={!!busy} onClick={() => queue(`next:${s.sessionId}`, s, "next")}>
              <PhoneCall size={14} aria-hidden />Call next{sessions.length > 1 ? ` (${i + 1})` : ""}
            </button>
          ))}
          {data.can.write && (
            <Link href={data.isTokenBusiness ? "/dashboard/queue" : "/dashboard/appointments?new=1"} className={btn}><UserPlus size={14} aria-hidden />Add walk-in</Link>
          )}
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-red-600 py-1">{error}</p>}
      {data.rows.length === 0 ? (
        <p className="text-sm text-[#6b6b80] py-4">No {appointmentWord} today.</p>
      ) : (
        <ul>
          {open.map((r) => <Row key={r.id} r={r} />)}
          {done.map((r) => <Row key={r.id} r={r} />)}
        </ul>
      )}
    </section>
  );
}
