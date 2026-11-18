import { Logo } from "@/components/ui/Logo";

/**
 * Dark full-height background + logo + white card used by every auth screen. With `aside`, laptop screens (lg and up) get a
 * wide two-panel card (benefits on the left, the form on the right); phones and tablets keep the single narrow card.
 */
export default function AuthShell({ children, className = "", aside }: { children: React.ReactNode; className?: string; aside?: React.ReactNode }) {
  return (
    <div
      className="min-h-dvh bg-[#0f0f1a] flex items-center justify-center px-4 safe-pt-4 safe-pb-4"
    >
      <div className={`w-full max-w-md ${aside ? "sm:max-w-xl lg:max-w-5xl" : ""}`}>
        <div className="flex justify-center mb-8 sm:mb-10">
          <Logo width={120} className="brightness-0 invert" priority />
        </div>
        <div className={`bg-white rounded-3xl shadow-2xl overflow-hidden ${aside ? "lg:grid lg:grid-cols-5" : ""}`}>
          {aside && <div className="hidden lg:flex lg:col-span-2 relative overflow-hidden bg-gradient-to-br from-sky-600 to-sky-800 p-10 flex-col justify-center">{aside}</div>}
          <div className={`p-6 sm:p-8 ${aside ? "lg:col-span-3 lg:p-10" : ""} ${className}`}>{children}</div>
        </div>
        <p className="text-center text-white/60 text-xs mt-6">© 2026 Calvy · All rights reserved</p>
      </div>
    </div>
  );
}

export const inputClass =
  "w-full min-h-11 rounded-xl border border-[#e8e6e0] px-4 py-3 text-sm text-[#0f0f1a] focus:outline-none focus:ring-2 focus:ring-[#0284c7]/40 focus:border-[#0284c7] transition-all";
export const primaryBtn =
  "w-full min-h-11 inline-flex items-center justify-center bg-[#0284c7] text-white font-semibold rounded-xl py-3 text-sm hover:bg-[#0369a1] transition-colors disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284c7] focus-visible:ring-offset-2";
export const secondaryBtn =
  "w-full min-h-11 inline-flex items-center justify-center border border-[#0284c7] text-[#0369a1] font-semibold rounded-xl py-3 text-sm hover:bg-sky-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284c7] focus-visible:ring-offset-2";
export const linkClass =
  "text-[#0369a1] font-semibold hover:underline rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284c7]";
