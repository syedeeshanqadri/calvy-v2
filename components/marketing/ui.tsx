// Building blocks for the marketing site (step 30). One look: warm off-white, borders not shadows, one 12px radius,
// monochrome blue line icons, left-aligned headings in the display font, marigold only as a fill or highlight.
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { RegionImage } from "./RegionImage";

export const WRAP = "max-w-6xl mx-auto px-4 sm:px-6 lg:px-8";

export function Section({ id, children, tone = "paper", className = "" }: { id?: string; children: ReactNode; tone?: "paper" | "card" | "blue"; className?: string }) {
  const bg = tone === "blue" ? "bg-cv-blue text-white" : tone === "card" ? "bg-white" : "bg-[#FBFBFA]";
  return (
    <section id={id} className={`mk ${bg} border-t border-black/[0.06] py-20 sm:py-24 lg:py-28 ${className}`}>
      <div className={WRAP}>{children}</div>
    </section>
  );
}

/** Left-aligned section heading: display font, solid ink, no badge above it. */
export function Heading({ title, intro, tone = "light", as: Tag = "h2", children }: { title: ReactNode; intro?: ReactNode; tone?: "light" | "dark"; as?: "h1" | "h2"; children?: ReactNode }) {
  return (
    <div className="max-w-2xl mb-10 lg:mb-14">
      <Tag className={`font-display font-bold tracking-[-0.02em] text-3xl sm:text-4xl lg:text-[2.75rem] leading-[1.08] text-balance ${tone === "dark" ? "text-white" : "text-cv-ink"}`}>{title}</Tag>
      {intro && <p className={`mt-4 text-lg leading-relaxed ${tone === "dark" ? "text-white/80" : "text-cv-mute"}`}>{intro}</p>}
      {children}
    </div>
  );
}

export const card = "bg-cv-card border border-cv-line rounded-xl";

export function PrimaryLink({ href, children, className = "" }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link href={href} className={`group inline-flex items-center justify-center gap-2 min-h-12 px-7 rounded-xl bg-cv-blue hover:bg-cv-blue-dark text-white font-semibold transition-colors ${className}`}>
      {children} <ArrowRight size={17} className="group-hover:translate-x-0.5 transition-transform" aria-hidden />
    </Link>
  );
}
/** The one marigold fill: used on the solid blue bands. Dark ink on marigold is 7.2:1. */
export function AccentLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="group inline-flex items-center justify-center gap-2 min-h-12 px-7 rounded-xl bg-cv-marigold hover:brightness-95 text-cv-ink font-semibold transition">
      {children} <ArrowRight size={17} className="group-hover:translate-x-0.5 transition-transform" aria-hidden />
    </Link>
  );
}
export function OutlineLink({ href, children, tone = "light" }: { href: string; children: ReactNode; tone?: "light" | "dark" }) {
  return (
    <Link href={href} className={`inline-flex items-center justify-center min-h-12 px-7 rounded-xl border font-semibold transition-colors ${tone === "dark" ? "border-white/40 text-white hover:bg-white/10" : "border-cv-line text-cv-ink hover:bg-cv-card"}`}>{children}</Link>
  );
}

/** One phone outline: a 2px border and a dark bezel, nothing else. The picture inside is always a real screenshot. */
export function Phone({ name, alt, priority = false, className = "", crop }: { name: string; alt: string; priority?: boolean; className?: string; crop?: boolean }) {
  return (
    <div className={`mx-auto w-full max-w-[250px] rounded-[26px] border-2 border-cv-ink bg-cv-ink p-1.5 ${className}`}>
      <div className={`overflow-hidden rounded-[20px] bg-white ${crop ? "max-h-[470px]" : ""}`}>
        <RegionImage name={name} alt={alt} width={520} height={1125} priority={priority} className="block w-full h-auto" />
      </div>
    </div>
  );
}

/** One browser window: a thin bar with three neutral dots and the address. */
export function Browser({ name, alt, url = "yourname.calvy.io", priority = false, className = "" }: { name: string; alt: string; url?: string; priority?: boolean; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-xl border border-cv-line bg-white ${className}`}>
      <div className="flex items-center gap-1.5 border-b border-cv-line bg-cv-paper px-3 py-2" aria-hidden>
        <span className="h-2 w-2 rounded-full bg-cv-line" /><span className="h-2 w-2 rounded-full bg-cv-line" /><span className="h-2 w-2 rounded-full bg-cv-line" />
        <span className="ml-2 truncate rounded-md border border-cv-line bg-white px-2 py-0.5 text-[11px] text-cv-mute">{url}</span>
      </div>
      <RegionImage name={name} alt={alt} width={1200} height={750} priority={priority} className="block w-full h-auto" />
    </div>
  );
}

/** Monochrome line icon in the brand blue: no tile, no colour variety. */
export function Icon({ Svg, size = 22 }: { Svg: React.ElementType; size?: number }) {
  return <Svg size={size} className="text-cv-blue" strokeWidth={1.75} aria-hidden />;
}
