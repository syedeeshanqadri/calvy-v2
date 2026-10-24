"use client";
import { useState } from "react";
import { bestContrast, isValidHex, normalizeHex, readableForeground, textOnWhiteWarning, themePresets } from "@/lib/theme";

/** Theme colour: pack presets, a colour wheel and a hex field, with a contrast check. Available on every plan. */
export function ThemeColorPicker({ value, onChange, packId, id = "theme-color" }: {
  value: string;
  onChange: (hex: string) => void;
  packId?: string | null;
  id?: string;
}) {
  const [draft, setDraft] = useState(value);
  const current = normalizeHex(value) ?? value;
  const fg = readableForeground(current);
  const warning = isValidHex(current) ? textOnWhiteWarning(current) : null;
  const draftBad = draft !== "" && !isValidHex(draft.startsWith("#") ? draft : `#${draft}`);

  const pick = (hex: string) => { onChange(hex); setDraft(hex); };

  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium text-brand-800 block mb-2">Theme colour</label>
      <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="Suggested colours">
        {themePresets(packId).map((c) => (
          <button
            key={c} type="button" onClick={() => pick(c)} aria-label={`Use ${c}`} aria-pressed={current === c}
            className={`w-8 h-8 rounded-full border-2 transition-all ${current === c ? "border-brand-900 scale-110" : "border-transparent"}`}
            style={{ background: c }}
          />
        ))}
        <input
          type="color" aria-label="Pick a custom colour" value={isValidHex(current) && current.length === 7 ? current : "#0284c7"}
          onChange={(e) => pick(e.target.value)}
          className="w-8 h-8 rounded-full border border-[#e8e6e0] cursor-pointer p-0.5 bg-white"
        />
        <input
          id={id} type="text" inputMode="text" maxLength={7} spellCheck={false} value={draft} aria-invalid={draftBad}
          onChange={(e) => {
            const v = e.target.value.trim();
            setDraft(v);
            const n = normalizeHex(v.startsWith("#") ? v : `#${v}`);
            if (n) onChange(n);
          }}
          onBlur={() => setDraft(normalizeHex(value) ?? value)}
          className={`w-24 h-8 rounded-lg border px-2 text-xs font-mono ${draftBad ? "border-red-400" : "border-[#e8e6e0]"}`}
          placeholder="#0284c7"
        />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <span className="px-4 py-2 rounded-xl text-xs font-bold" style={{ background: current, color: fg }}>Book now</span>
        {isValidHex(current) && <span className="text-xs text-[#6b6b80]">Button text contrast {bestContrast(current).toFixed(1)}:1</span>}
      </div>
      {draftBad && <p role="alert" className="text-xs text-red-600 mt-1.5">Enter a hex colour like #0284c7.</p>}
      {warning && <p className="text-xs text-amber-700 mt-1.5">{warning}</p>}
    </div>
  );
}
