"use client";
import { ALL_PACKS } from "@/lib/packs";
import type { PackId } from "@/lib/packs/types";
import { PACK_ICON } from "./packIcons";

/** Accessible single-choice picker for the five business packs. */
export function PackPicker({ value, onChange, legend = "What kind of business is it?", name = "pack" }: {
  value: PackId;
  onChange: (id: PackId) => void;
  legend?: string;
  name?: string;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-[#0f0f1a] mb-1.5">{legend}</legend>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {ALL_PACKS.map((p) => {
          const Icon = PACK_ICON[p.id];
          const selected = value === p.id;
          return (
            <label
              key={p.id}
              className={`flex items-start gap-3 rounded-xl border-2 p-3 cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-accent/30 ${selected ? "border-accent bg-accent/5" : "border-[#e8e6e0] hover:border-accent/50"}`}
            >
              <input type="radio" name={name} value={p.id} checked={selected} onChange={() => onChange(p.id)} className="sr-only" />
              <Icon size={20} aria-hidden="true" className={`mt-0.5 flex-shrink-0 ${selected ? "text-accent" : "text-[#6b6b80]"}`} />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-[#0f0f1a]">{p.label}</span>
                <span className="block text-xs text-[#6b6b80]">{p.blurb}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
