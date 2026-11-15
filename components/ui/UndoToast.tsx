"use client";

/** "Marked completed · Undo": sits above the bottom nav on phones, bottom-right on larger screens. */
export function UndoToast({ label, onUndo }: { label: string | null; onUndo: () => void }) {
  if (!label) return null;
  return (
    <div role="status" aria-live="polite" className="fixed left-1/2 -translate-x-1/2 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] md:bottom-6 z-[80] flex items-center gap-3 rounded-xl bg-[#0f0f1a] text-white text-sm pl-4 pr-1 py-1 shadow-xl max-w-[calc(100vw-2rem)]" data-testid="undo-toast">
      <span className="min-w-0 truncate">{label}</span>
      <button type="button" onClick={onUndo} className="shrink-0 min-h-11 px-4 rounded-lg font-semibold text-sky-300 hover:text-sky-200">Undo</button>
    </div>
  );
}
