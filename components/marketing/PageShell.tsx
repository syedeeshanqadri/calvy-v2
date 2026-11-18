import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";

/** Light premium hero used by the About and Contact pages: same look as the landing hero (soft sky gradient, dot grid). */
export function PageHero({ eyebrow, title, intro, children, visual }: { eyebrow: string; title: string; intro: string; children?: React.ReactNode; visual?: React.ReactNode }) {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-sky-50 via-white to-white pt-28 sm:pt-32 pb-14 sm:pb-20">
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        <div className="absolute -top-40 -left-32 w-[640px] h-[640px] rounded-full bg-sky-300/30 blur-3xl" />
        <div className="absolute -bottom-40 right-0 w-[560px] h-[560px] rounded-full bg-indigo-200/40 blur-3xl" />
        <div className="absolute inset-0 opacity-[0.5]" style={{ backgroundImage: "radial-gradient(#dbe4ee 1px, transparent 1px)", backgroundSize: "30px 30px" }} />
      </div>
      <div className={`relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 ${visual ? "grid lg:grid-cols-2 gap-12 items-center" : ""}`}>
        <div className={`min-w-0 ${visual ? "" : "max-w-3xl mx-auto text-center"}`}>
          <span className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-sky-700">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-500" /> {eyebrow}
          </span>
          <h1 className="mt-6 font-syne font-extrabold text-4xl sm:text-5xl leading-[1.05] tracking-tight text-gray-900 text-balance">{title}</h1>
          <p className={`mt-6 text-lg text-gray-600 leading-relaxed ${visual ? "max-w-xl" : "max-w-2xl mx-auto"}`}>{intro}</p>
          {children}
        </div>
        {visual && <div className="relative mx-auto w-full max-w-md pb-8">{visual}</div>}
      </div>
    </section>
  );
}

export function SectionHead({ eyebrow, title, center = true }: { eyebrow: string; title: string; center?: boolean }) {
  return (
    <div className={center ? "text-center max-w-2xl mx-auto" : "max-w-2xl"}>
      <p className="text-xs font-bold uppercase tracking-widest text-sky-600">{eyebrow}</p>
      <h2 className="mt-3 font-syne font-extrabold text-3xl sm:text-4xl text-gray-900 text-balance">{title}</h2>
    </div>
  );
}

export function CtaBand({ title, text, primary = { href: "/signup", label: "Start free" }, secondary = { href: "/pricing", label: "See pricing" } }: { title: string; text: string; primary?: { href: string; label: string }; secondary?: { href: string; label: string } }) {
  return (
    <section className="relative overflow-hidden bg-[#0b1220] py-16 sm:py-20">
      <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[640px] h-[320px] rounded-full bg-sky-500/20 blur-3xl" aria-hidden />
      <div className="relative max-w-3xl mx-auto px-4 text-center">
        <h2 className="font-syne font-extrabold text-3xl sm:text-4xl text-white text-balance">{title}</h2>
        <p className="mt-4 text-slate-300 text-lg">{text}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href={primary.href} className="group inline-flex items-center justify-center gap-2 min-h-12 px-8 rounded-2xl bg-sky-500 hover:bg-sky-400 text-white font-semibold transition-colors">{primary.label} <ArrowRight size={17} className="group-hover:translate-x-1 transition-transform" /></Link>
          <Link href={secondary.href} className="inline-flex items-center justify-center min-h-12 px-8 rounded-2xl border border-white/20 hover:bg-white/10 text-white font-semibold transition-colors">{secondary.label}</Link>
        </div>
      </div>
    </section>
  );
}

export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="bg-white">
      <Navbar />
      {children}
      <Footer />
    </main>
  );
}
