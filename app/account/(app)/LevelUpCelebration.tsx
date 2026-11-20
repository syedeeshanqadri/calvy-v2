"use client";
import { useEffect, useRef, useState } from "react";
import { PartyPopper } from "lucide-react";

/** The level-up screen: shown once after reaching a new level, closed with one button (which tells the server it was seen). */
export function LevelUpCelebration({ level, perk }: { level: string; perk: string | null }) {
  const [open, setOpen] = useState(true);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => { btn.current?.focus(); }, []);
  async function close() {
    setOpen(false);
    try { await fetch("/api/customer/level/seen", { method: "POST" }); } catch { /* shown again next time at worst */ }
  }
  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="levelup-title" className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-3xl bg-white p-8 text-center shadow-xl">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-cv-marigold text-cv-ink"><PartyPopper size={28} aria-hidden /></span>
        <h2 id="levelup-title" className="font-display font-bold text-2xl mt-4">You reached {level}!</h2>
        <p className="text-sm text-[#4b4b5e] mt-2">Thank you for showing up. Your nominal fee is now lower where it applies.</p>
        {perk && <p className="text-sm mt-3">{perk}</p>}
        <button ref={btn} type="button" onClick={close} className="mt-6 h-11 w-full rounded-xl bg-cv-blue hover:bg-cv-blue-dark text-white font-semibold">Great, thanks</button>
      </div>
    </div>
  );
}
