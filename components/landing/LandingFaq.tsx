import Link from "next/link";
import { LANDING_FAQ } from "@/lib/landingFaq";
import { Section, Heading } from "@/components/marketing/ui";
import { Reveal } from "@/components/marketing/Reveal";
import { ReceptionScene } from "@/components/marketing/Illustrations";
import { RegionPhoto } from "@/components/marketing/RegionPhoto";
import { photosFor } from "@/lib/marketingConfig";
import { SUPPORT_EMAIL } from "@/lib/site";

export function LandingFaq() {
  return (
    <Section id="faq" tone="paper">
      <Reveal><Heading title="Frequently asked questions" intro="Straight answers about plans, payments and how Calvy works." /></Reveal>
      <div className="grid items-start gap-12 lg:grid-cols-5 lg:gap-16">
        <Reveal className="lg:col-span-2 lg:sticky lg:top-28">
          <div className="relative aspect-[4/5] overflow-hidden rounded-mk-img bg-cv-blue max-sm:aspect-[5/4]">
            <RegionPhoto photos={photosFor("faq")} sizes="(max-width: 1024px) 92vw, 40vw"><ReceptionScene className="absolute inset-0 h-full w-full" /></RegionPhoto>
          </div>
          <p className="mt-6 text-sm text-cv-mute">Still have a question? <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-cv-blue underline underline-offset-4">{SUPPORT_EMAIL}</a></p>
        </Reveal>
        <Reveal delay={0.08} className="lg:col-span-3">
          <div className="space-y-3">
            {LANDING_FAQ.map((f) => (
              <details key={f.q} className="group rounded-mk-card border border-black/[0.08] bg-white open:border-cv-blue/40">
                <summary className="mk-focus flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-6 py-4 text-[15px] font-semibold text-cv-ink">
                  {f.q}
                  <span aria-hidden className="text-xl leading-none text-cv-blue transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="m-0 px-6 pb-5 text-sm leading-relaxed text-cv-mute">{f.a}</p>
              </details>
            ))}
          </div>
          <p className="mt-8 mb-0"><Link href="/signup" className="mk-focus inline-flex min-h-12 items-center rounded-[14px] bg-cv-blue px-7 font-semibold text-white transition hover:bg-cv-blue-dark">Start free</Link></p>
        </Reveal>
      </div>
    </Section>
  );
}
