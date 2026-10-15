"use client";
import { useState } from "react";
import { inputClass } from "./AuthShell";

interface Props {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: "current-password" | "new-password";
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  /** Rendered on the right of the label row (e.g. "Forgot password?"). */
  labelAction?: React.ReactNode;
  /** Always-visible helper text (e.g. the password rule). */
  hint?: string;
  error?: string;
  describedBy?: string;
}

export default function PasswordInput({
  id, label, value, onChange, autoComplete, placeholder, required = true, minLength, labelAction, hint, error, describedBy,
}: Props) {
  const [shown, setShown] = useState(false);
  const hintId = `${id}-hint`;
  const errId = `${id}-error`;
  const described = [hint ? hintId : "", error ? errId : "", describedBy ?? ""].filter(Boolean).join(" ") || undefined;
  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <label htmlFor={id} className="text-sm font-medium text-[#0f0f1a]">{label}</label>
        {labelAction}
      </div>
      <div className="relative">
        <input
          id={id}
          type={shown ? "text" : "password"}
          required={required}
          minLength={minLength}
          autoComplete={autoComplete}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={described}
          className={`${inputClass} pr-12 ${error ? "border-red-600" : ""}`}
        />
        <button
          type="button"
          onClick={() => setShown(s => !s)}
          aria-pressed={shown}
          aria-label="Show password"
          className="absolute right-0 top-0 h-full w-11 flex items-center justify-center text-[#6b6b80] hover:text-[#0f0f1a] rounded-r-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284c7]"
        >
          {shown ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          )}
        </button>
      </div>
      {hint && <p id={hintId} className="text-xs text-[#6b6b80] mt-1.5">{hint}</p>}
      {error && <p id={errId} role="alert" className="text-sm text-red-600 mt-1.5">{error}</p>}
    </div>
  );
}
