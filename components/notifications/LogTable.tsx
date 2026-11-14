"use client";
import { useState } from "react";
import type { LogRow } from "@/lib/notifications/log";

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  SENT: { label: "Sent", cls: "bg-emerald-50 text-emerald-700" },
  FAILED: { label: "Failed", cls: "bg-red-50 text-red-700" },
  SKIPPED: { label: "Skipped", cls: "bg-amber-50 text-amber-800" },
  PENDING: { label: "Queued", cls: "bg-sky-50 text-sky-700" },
  DELIVERED: { label: "Delivered", cls: "bg-emerald-50 text-emerald-700" },
  READ: { label: "Read", cls: "bg-emerald-100 text-emerald-800" },
  SENDING: { label: "Sending", cls: "bg-sky-50 text-sky-700" },
};

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

/**
 * Delivery log rows. `resendBase` is the API prefix (`/api/notifications/log` or the admin one);
 * `businessNames` adds a Business column (admin view).
 */
export function LogTable({ rows, resendBase, businessNames }: { rows: LogRow[]; resendBase: string; businessNames?: Record<string, string> }) {
  const [state, setState] = useState<Record<string, { busy?: boolean; status?: string; error?: string }>>({});

  async function resend(id: string) {
    setState((s) => ({ ...s, [id]: { busy: true } }));
    try {
      const res = await fetch(`${resendBase}/${encodeURIComponent(id)}/resend`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { status?: string; error?: string };
      setState((s) => ({ ...s, [id]: res.ok ? { status: data.status } : { error: data.error ?? "Resend failed" } }));
    } catch {
      setState((s) => ({ ...s, [id]: { error: "Network error" } }));
    }
  }

  if (!rows.length) return <p className="py-10 text-center text-sm text-[#6b6b80]">No messages match these filters.</p>;

  const renderRow = (r: LogRow) => {
    const s = state[r.id];
    const shown = s?.status ?? r.status;
    const style = STATUS_STYLE[shown] ?? { label: shown, cls: "bg-gray-100 text-gray-700" };
    const reason = s?.error ?? (shown === r.status ? r.error : null);
    return { s, shown, style, reason };
  };
  const resendButton = (r: LogRow, s: { busy?: boolean; status?: string } | undefined) =>
    r.resendable && !s?.status ? (
      <button type="button" onClick={() => resend(r.id)} disabled={s?.busy}
        className="rounded-lg border border-[#e5e2dc] px-3 py-1 text-xs font-medium text-[#0f0f1a] hover:bg-[#f8f7f4] disabled:opacity-50">
        {s?.busy ? "Sending…" : "Resend"}
      </button>
    ) : null;

  return (
    <>
      {/* Phones: one card per message, no sideways scrolling */}
      <ul className="md:hidden space-y-2" data-testid="log-cards">
        {rows.map((r) => {
          const { s, shown, style, reason } = renderRow(r);
          return (
            <li key={r.id} className="rounded-xl border border-[#f0ede8] bg-white p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-[#0f0f1a] break-words">{r.eventLabel}</p>
                  <p className="text-xs text-[#6b6b80]">{r.channelLabel} · {r.audience.toLowerCase()}</p>
                </div>
                <span className={`shrink-0 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${style.cls}`}>{style.label}</span>
              </div>
              <p className="mt-1.5 break-all text-[#0f0f1a]">{r.recipient}</p>
              {businessNames && <p className="text-xs text-[#6b6b80]">{r.businessId ? businessNames[r.businessId] ?? "Deleted business" : "Platform"}</p>}
              {reason && <p className="mt-1 text-xs text-[#6b6b80] break-words">{reason}</p>}
              <div className="mt-2 flex items-center justify-between gap-2 text-xs text-[#6b6b80]">
                <span suppressHydrationWarning>{when(r.createdAt)}{r.attempts > 1 && shown === r.status ? ` · ${r.attempts} attempts` : ""}</span>
                {resendButton(r, s)}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="hidden md:block overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-[#f0ede8] text-xs uppercase tracking-wide text-[#6b6b80]">
            <tr>
              <th className="py-2 pr-3 font-medium">Time</th>
              {businessNames && <th className="py-2 pr-3 font-medium">Business</th>}
              <th className="py-2 pr-3 font-medium">Message</th>
              <th className="py-2 pr-3 font-medium">To</th>
              <th className="py-2 pr-3 font-medium">Status</th>
              <th className="py-2 font-medium"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const { s, shown, style, reason } = renderRow(r);
              return (
                <tr key={r.id} className="border-b border-[#f0ede8] align-top last:border-0">
                  <td className="whitespace-nowrap py-2.5 pr-3 text-[#6b6b80]" suppressHydrationWarning>{when(r.createdAt)}</td>
                  {businessNames && <td className="py-2.5 pr-3">{r.businessId ? businessNames[r.businessId] ?? "Deleted business" : <span className="text-[#6b6b80]">Platform</span>}</td>}
                  <td className="py-2.5 pr-3">
                    <span className="text-[#0f0f1a]">{r.eventLabel}</span>
                    <span className="block text-xs text-[#6b6b80]">{r.channelLabel} · {r.audience.toLowerCase()}</span>
                  </td>
                  <td className="break-all py-2.5 pr-3 text-[#0f0f1a]">{r.recipient}</td>
                  <td className="py-2.5 pr-3">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${style.cls}`}>{style.label}</span>
                    {reason && <span className="mt-1 block max-w-[22rem] text-xs text-[#6b6b80]">{reason}</span>}
                    {r.attempts > 1 && shown === r.status && <span className="block text-xs text-[#6b6b80]">{r.attempts} attempts</span>}
                  </td>
                  <td className="py-2.5 text-right">{resendButton(r, s)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
