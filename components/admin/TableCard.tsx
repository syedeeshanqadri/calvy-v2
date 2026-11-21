import { cn } from "@/lib/utils";

/**
 * A table inside a card. The card never grows past its column: a table wider than the screen scrolls sideways INSIDE the card, and the page never
 * does. `min-w-0` is what lets the card shrink inside a flex or grid parent; `minWidth` keeps the columns readable instead of squashed.
 */
export function TableCard({ children, minWidth = 720, className, label }: { children: React.ReactNode; minWidth?: number; className?: string; label?: string }) {
  return (
    <div className={cn("min-w-0 max-w-full overflow-hidden rounded-2xl border border-[#e8e6e0] bg-white", className)}>
      <div className="max-w-full overflow-x-auto overscroll-x-contain" role="region" aria-label={label} tabIndex={0}>
        <table className="w-full text-sm" style={{ minWidth }}>{children}</table>
      </div>
    </div>
  );
}

/** A cell whose text may be long: one line, cut with an ellipsis, the full text in the tooltip. */
export function TruncCell({ children, text, max = 240, className }: { children?: React.ReactNode; text?: string | null; max?: number; className?: string }) {
  const full = text ?? (typeof children === "string" ? children : undefined);
  return <td className={cn("px-4 py-3", className)}><span className="block truncate" style={{ maxWidth: max }} title={full || undefined}>{children ?? text}</span></td>;
}
