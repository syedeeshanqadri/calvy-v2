"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function CouponToggle({ id, active }: { id: string; active: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function flip() {
    setBusy(true);
    try {
      await fetch(`/api/admin/coupons/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !active }) });
      router.refresh();
    } finally { setBusy(false); }
  }
  return <button type="button" onClick={flip} disabled={busy} aria-pressed={active} className={`h-9 px-4 rounded-xl text-sm font-semibold disabled:opacity-60 ${active ? "bg-[#e7f7ec] text-[#166534]" : "bg-[#f1f0ec] text-[#4b4b5e]"}`}>{busy ? "Saving…" : active ? "Active (switch off)" : "Off (switch on)"}</button>;
}
