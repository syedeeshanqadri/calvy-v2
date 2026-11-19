"use client";
import { useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { planName, planQuery } from "@/lib/planCopy";

/** Shown after onboarding when the owner picked Pro or Business: links to Billing with that plan selected, until they upgrade or dismiss it. */
export function UpgradeBanner({ plan }: { plan: "professional" | "business" }) {
  const [gone, setGone] = useState(false);
  if (gone) return null;
  const name = planName(plan);
  async function dismiss() {
    setGone(true);
    await fetch("/api/dashboard/upgrade-banner", { method: "POST" }).catch(() => undefined);
  }
  return (
    <div role="status" data-testid="upgrade-banner" className="mb-4 flex items-center gap-3 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-syne font-bold text-[#0f0f1a] text-sm">Complete your upgrade to {name}</p>
        <p className="text-xs text-[#3d3d4d]">You started on Free. Pick up where you left off; nothing is charged until you confirm.</p>
      </div>
      <Link href={`/dashboard/billing?plan=${planQuery(plan)}`} className="shrink-0 min-h-11 inline-flex items-center rounded-xl bg-[#0f0f1a] px-4 text-sm font-semibold text-white">Upgrade to {name}</Link>
      <button type="button" onClick={dismiss} aria-label="Dismiss" className="shrink-0 min-h-11 min-w-11 inline-flex items-center justify-center text-[#6b6b80] hover:text-[#0f0f1a]"><X size={16} aria-hidden /></button>
    </div>
  );
}
