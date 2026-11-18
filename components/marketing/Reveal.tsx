"use client";
import { useEffect, useRef, type ReactNode } from "react";

/** Fades its children up once when they scroll into view. Visible straight away without JS, with reduced motion, or without IntersectionObserver. */
export function Reveal({ children, className = "", delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { el.classList.add("is-in"); return; }
    const io = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -8% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} className={`mk-reveal ${className}`} style={{ ["--mk-delay" as string]: `${delay}s` }}>{children}</div>;
}
