import { Check } from "lucide-react";
import { DemoButton } from "./DemoButton";
import { AccentLink, WRAP } from "@/components/marketing/ui";
import { TeamScene } from "@/components/marketing/PackScenes";
import { Reveal } from "@/components/marketing/Reveal";

/** Closing call to action: a deep-blue rounded panel with the team scene, one marigold button. */
export function CTA() {
  return (
    <section className="mk border-t border-black/[0.06] bg-white py-20 sm:py-24">
      <div className={WRAP}>
        <Reveal>
          <div className="relative overflow-hidden rounded-mk-img bg-cv-blue">
            <div className="grid items-center lg:grid-cols-[1.1fr_1fr]">
              <div className="relative z-10 p-8 sm:p-12 lg:p-16">
                <h2 className="m-0 font-display text-3xl font-bold leading-[1.06] tracking-[-0.02em] text-white text-balance sm:text-4xl lg:text-5xl">Stop losing clients to missed bookings</h2>
                <p className="mt-5 max-w-xl text-lg text-white/85">Put your website and booking page online today. Start free, add your services, and share one link with your customers. No tech skills needed.</p>
                <ul className="mt-6 flex list-none flex-wrap gap-x-6 gap-y-2 p-0 text-sm text-white/85">
                  {["Free plan", "No credit card", "Cancel anytime"].map((t) => <li key={t} className="flex items-center gap-1.5"><Check size={15} aria-hidden /> {t}</li>)}
                </ul>
                <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
                  <AccentLink href="/signup">Start free</AccentLink>
                  <DemoButton source="cta-demo" className="mk-focus inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/40 px-8 text-base font-semibold text-white transition-colors hover:bg-white/10">Book a personal demo</DemoButton>
                </div>
              </div>
              <div className="relative h-[260px] lg:h-full lg:min-h-[420px]"><TeamScene className="absolute inset-0 h-full w-full" /></div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
