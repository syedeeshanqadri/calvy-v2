"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PackPicker } from "./PackPicker";
import { getPack } from "@/lib/packs";
import type { PackId } from "@/lib/packs/types";

interface ApplyResult { added: string[]; skippedExisting: string[]; skippedLimit: string[] }

/** Settings card: change the business pack and optionally add its default services (safe to repeat). */
export function PackSettings({ initialPackId }: { initialPackId: PackId }) {
  const router = useRouter();
  const [current, setCurrent] = useState<PackId>(initialPackId);
  const [packId, setPackId] = useState<PackId>(initialPackId);
  const [applyDefaults, setApplyDefaults] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const changed = packId !== current;
  const pack = getPack(packId);

  async function save() {
    setBusy(true); setError(""); setMessage("");
    try {
      const res = await fetch("/api/settings/pack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId, applyDefaults }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not save. Try again.");
      setCurrent(packId);
      const r: ApplyResult | null = data.applied ?? null;
      if (!r) setMessage("Business type saved.");
      else {
        const parts = [`Added ${r.added.length} service${r.added.length === 1 ? "" : "s"}`];
        if (r.skippedExisting.length) parts.push(`${r.skippedExisting.length} already existed`);
        if (r.skippedLimit.length) parts.push(`${r.skippedLimit.length} skipped (plan service limit)`);
        setMessage(`Business type saved. ${parts.join(", ")}.`);
      }
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <PackPicker value={packId} onChange={setPackId} legend="Business type" name="settings-pack" />
      <label className="flex items-start gap-2 text-sm text-[#374151]">
        <input type="checkbox" checked={applyDefaults} onChange={(e) => setApplyDefaults(e.target.checked)} className="mt-1" />
        <span>
          Add the default {pack.label} services ({pack.defaultServices.map((s) => s.name).join(", ")}). Services you already have are never changed.
        </span>
      </label>
      <div className="flex items-center gap-3">
        <button
          type="button" onClick={save} disabled={busy || (!changed && !applyDefaults)}
          className="h-10 px-4 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-semibold disabled:opacity-50"
        >
          {busy ? "Saving…" : changed ? "Change business type" : "Add default services"}
        </button>
        <div role="status" aria-live="polite" className="text-sm">
          {message && <span className="text-green-700">{message}</span>}
          {error && <span className="text-red-600">{error}</span>}
        </div>
      </div>
    </div>
  );
}
