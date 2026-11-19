"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { LEVEL_LABEL, type Alternative, type EarnedLevelId, type LevelConfigData } from "@/lib/rewards/levels";

const num = "h-9 w-20 rounded-lg border border-[#e8e6e0] bg-white px-2 text-sm";
const EARNED: EarnedLevelId[] = ["REGULAR", "INSIDER", "PRO", "LEGEND"];

/** Edit every fee, requirement, window, the retention period and fast-track. Fees are typed in rupees and stored as paise. */
export function LevelConfigForm({ initial }: { initial: LevelConfigData }) {
  const router = useRouter();
  const [c, setC] = useState<LevelConfigData>(initial);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const setAlt = (l: EarnedLevelId, i: number, k: keyof Alternative, v: number) =>
    setC((p) => ({ ...p, levels: { ...p.levels, [l]: { ...p.levels[l], alternatives: p.levels[l].alternatives.map((a, j) => (j === i ? { ...a, [k]: v } : a)) } } }));

  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg("");
    try {
      const res = await fetch("/api/admin/rewards/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ config: c, reason }) });
      const d = await res.json().catch(() => ({}));
      setMsg(res.ok ? "Saved and audited." : d.error ?? "Could not save (check the numbers).");
      if (res.ok) router.refresh();
    } catch { setMsg("Network error."); } finally { setBusy(false); }
  }

  return (
    <form onSubmit={save} className="bg-white rounded-2xl border border-[#e8e6e0] p-4 space-y-5">
      <div className="flex flex-wrap gap-4 text-xs font-semibold text-[#4b4b5e]">
        <label className="block">Fee floor (Rs)<input type="number" step="any" min={1} className={`${num} block`} value={c.floorMinor / 100} onChange={(e) => setC({ ...c, floorMinor: Math.round(Number(e.target.value) * 100) })} /></label>
        <label className="block">Hold after last visit (days)<input type="number" min={30} className={`${num} block`} value={c.retentionDays} onChange={(e) => setC({ ...c, retentionDays: Number(e.target.value) })} /></label>
        <label className="block">Fast-track: attended days in a month<input type="number" min={2} className={`${num} block`} value={c.fastTrack.daysInMonth} onChange={(e) => setC({ ...c, fastTrack: { ...c.fastTrack, daysInMonth: Number(e.target.value) } })} /></label>
        <label className="block">Fast-track up to
          <select className="h-9 rounded-lg border border-[#e8e6e0] bg-white px-2 text-sm block" value={c.fastTrack.maxLevel} onChange={(e) => setC({ ...c, fastTrack: { ...c.fastTrack, maxLevel: e.target.value as "REGULAR" | "INSIDER" | "PRO" } })}>
            {(["REGULAR", "INSIDER", "PRO"] as const).map((l) => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}
          </select>
        </label>
      </div>
      {EARNED.map((l) => (
        <fieldset key={l} className="border border-[#e8e6e0] rounded-xl p-3 space-y-2">
          <legend className="px-1 text-sm font-bold">{LEVEL_LABEL[l]}</legend>
          <label className="text-xs font-semibold text-[#4b4b5e] block">Fee (Rs)<input type="number" step="any" min={1} className={`${num} block`} value={c.levels[l].feeMinor / 100} onChange={(e) => setC({ ...c, levels: { ...c.levels, [l]: { ...c.levels[l], feeMinor: Math.round(Number(e.target.value) * 100) } } })} /></label>
          {c.levels[l].alternatives.map((a, i) => (
            <div key={i} className="flex flex-wrap items-end gap-3 text-xs font-semibold text-[#4b4b5e]">
              <span className="self-center">{i === 0 ? "Way up" : "Or"}</span>
              {([["days", "Attended days"], ["windowDays", "inside (days)"], ["referrals", "Attended referrals"], ["months", "Active months in a row"]] as const).map(([k, label]) => (
                <label key={k} className="block">{label}<input type="number" min={0} className={`${num} block`} value={a[k]} onChange={(e) => setAlt(l, i, k, Number(e.target.value))} /></label>
              ))}
              {c.levels[l].alternatives.length > 1 && <button type="button" className="h-9 px-3 rounded-lg border border-[#e8e6e0] text-red-600" onClick={() => setC({ ...c, levels: { ...c.levels, [l]: { ...c.levels[l], alternatives: c.levels[l].alternatives.filter((_, j) => j !== i) } } })}>Remove</button>}
            </div>
          ))}
          {c.levels[l].alternatives.length < 3 && <button type="button" className="h-9 px-3 rounded-lg border border-[#e8e6e0] text-sm" onClick={() => setC({ ...c, levels: { ...c.levels, [l]: { ...c.levels[l], alternatives: [...c.levels[l].alternatives, { days: 5, windowDays: 90, referrals: 0, months: 0 }] } } })}>Add another way up</button>}
        </fieldset>
      ))}
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-semibold text-[#4b4b5e] block flex-1 min-w-56">Reason for the change (audited)
          <input required minLength={8} maxLength={500} className="h-10 w-full rounded-xl border border-[#e8e6e0] bg-white px-3 text-sm block" value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <button type="submit" disabled={busy} className="h-10 px-5 rounded-xl bg-[#0f0f14] text-white text-sm font-semibold disabled:opacity-60">{busy ? "Saving…" : "Save settings"}</button>
        {msg && <span role="status" className="text-sm">{msg}</span>}
      </div>
    </form>
  );
}
