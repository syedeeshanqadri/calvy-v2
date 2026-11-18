import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import { AccentLink, Heading, OutlineLink, WRAP } from "@/components/marketing/ui";

/** Page hero for /about and /contact: left-aligned heading in the display font on the warm off-white, optional real screenshot. */
export function PageHero({ title, intro, children, visual }: { eyebrow?: string; title: string; intro: string; children?: React.ReactNode; visual?: React.ReactNode }) {
  return (
    <section className="bg-cv-paper pt-28 sm:pt-32 pb-14 sm:pb-20">
      <div className={`${WRAP} ${visual ? "grid items-center gap-12 lg:grid-cols-2" : ""}`}>
        <div className="min-w-0 max-w-2xl">
          <h1 className="font-display font-bold text-4xl sm:text-5xl leading-[1.05] tracking-tight text-cv-ink text-balance">{title}</h1>
          <p className="mt-6 text-lg text-cv-mute leading-relaxed max-w-xl">{intro}</p>
          {children}
        </div>
        {visual && <div className="min-w-0">{visual}</div>}
      </div>
    </section>
  );
}

export function SectionHead({ title }: { eyebrow?: string; title: string; center?: boolean }) {
  return <Heading title={title} />;
}

/** Closing band: one solid deep-blue colour, left-aligned, one marigold button. */
export function CtaBand({ title, text, primary = { href: "/signup", label: "Start free" }, secondary = { href: "/pricing", label: "See pricing" } }: { title: string; text: string; primary?: { href: string; label: string }; secondary?: { href: string; label: string } }) {
  return (
    <section className="bg-cv-blue py-16 sm:py-20">
      <div className={WRAP}>
        <div className="max-w-3xl">
          <h2 className="font-display font-bold text-3xl sm:text-4xl text-white text-balance">{title}</h2>
          <p className="mt-4 text-white/85 text-lg">{text}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <AccentLink href={primary.href}>{primary.label}</AccentLink>
            <OutlineLink href={secondary.href} tone="dark">{secondary.label}</OutlineLink>
          </div>
        </div>
      </div>
    </section>
  );
}

export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="bg-cv-paper">
      <Navbar />
      {children}
      <Footer />
    </main>
  );
}
