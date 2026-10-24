"use client";
import { cn } from "@/lib/utils";
import type { Region } from "@/lib/pricing";

const OPTIONS: { region: Region; label: string }[] = [
  { region: "IN", label: "🇮🇳 India" },
  { region: "INTL", label: "🌍 International" },
];

export function RegionSwitcher({ region, onChange }: { region: Region; onChange: (r: Region) => void }) {
  return (
    <div className="inline-flex items-center gap-1 bg-white rounded-full p-1 border border-gray-200 shadow-sm" role="group" aria-label="Pricing region">
      {OPTIONS.map((o) => (
        <button
          key={o.region}
          type="button"
          onClick={() => onChange(o.region)}
          aria-pressed={region === o.region}
          className={cn("px-4 min-h-11 rounded-full text-sm font-semibold transition-all", region === o.region ? "bg-gray-900 text-white shadow-sm" : "text-gray-500 hover:text-gray-900")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
