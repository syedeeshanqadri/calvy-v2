"use client";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { useEffect, useRef } from "react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** Action buttons (Save, Cancel...). Always visible: pinned under the scrolling body, above the keyboard on phones. */
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const sizes = { sm: "md:max-w-sm", md: "md:max-w-lg", lg: "md:max-w-2xl", xl: "md:max-w-4xl" };

/**
 * Dialog. From 768px up: a centered card. On phones: a FULL-SCREEN sheet that follows the visible area (visualViewport), so
 * when the keyboard opens the sheet shrinks above it and the footer / action row stays in view instead of hiding behind it.
 * Inline action rows inside a <form> in the body are pinned too (see .sheet-body in globals.css); `footer` is the explicit way.
 */
export function Modal({ isOpen, onClose, title, children, footer, size = "md", className }: ModalProps) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    if (isOpen) { document.addEventListener("keydown", handler); document.body.style.overflow = "hidden"; }
    return () => { document.removeEventListener("keydown", handler); document.body.style.overflow = ""; };
  }, [isOpen, onClose]);

  // Size the sheet to what is actually visible (iOS keeps the layout viewport full height under the keyboard).
  useEffect(() => {
    const el = root.current;
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!isOpen || !el || !vv) return;
    const apply = () => { el.style.setProperty("--vvh", `${vv.height}px`); el.style.setProperty("--vvt", `${vv.offsetTop}px`); };
    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    return () => { vv.removeEventListener("resize", apply); vv.removeEventListener("scroll", apply); };
  }, [isOpen]);

  // A field that gets focus is scrolled into the middle of the (shrunken) sheet once the keyboard is up.
  const onFocus = (e: React.FocusEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    if (!/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    window.setTimeout(() => t.scrollIntoView({ block: "center", behavior: "smooth" }), 280);
  };

  if (!isOpen) return null;

  return (
    <div
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-x-0 top-[var(--vvt,0px)] h-[var(--vvh,100dvh)] z-50 flex md:inset-0 md:top-0 md:h-auto md:items-center md:justify-center md:p-4"
    >
      <div className="absolute inset-0 bg-brand-900/50 backdrop-blur-sm" aria-hidden="true" onClick={onClose} />
      <div
        onFocusCapture={onFocus}
        className={cn("relative w-full h-full bg-white flex flex-col animate-fade-up md:h-auto md:max-h-[90vh] md:rounded-2xl md:shadow-2xl", sizes[size], className)}
      >
        {title && (
          <div className="flex items-center justify-between gap-3 pl-4 pr-2 md:px-6 py-2 md:py-4 border-b border-[#f0ede8] flex-shrink-0 pt-[max(0.5rem,env(safe-area-inset-top))] md:pt-4">
            <h2 className="font-syne font-semibold text-lg min-w-0 truncate">{title}</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="w-11 h-11 rounded-xl flex items-center justify-center text-[#6b6b80] hover:bg-[#f0ede8] transition-colors flex-shrink-0">
              <X size={18} />
            </button>
          </div>
        )}
        <div className="sheet-body flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 md:p-6">{children}</div>
        {footer && (
          <div className="flex-shrink-0 border-t border-[#f0ede8] bg-white px-4 md:px-6 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:pb-4 flex items-center justify-end gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
