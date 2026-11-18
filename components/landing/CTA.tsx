import { Check } from "lucide-react";
import { DemoButton } from "./DemoButton";
import { AccentLink, WRAP } from "@/components/marketing/ui";

/** Closing call to action: one solid deep-blue band, left-aligned, one marigold button. */
export function CTA() {
  return (
    <section className="bg-cv-blue py-16 sm:py-20 border-t border-cv-line">
      <div className={WRAP}>
        <div className="max-w-3xl">
          <h2 className="font-display font-bold text-3xl sm:text-4xl lg:text-5xl text-white tracking-tight text-balance">Stop losing clients to missed bookings</h2>
          <p className="mt-5 text-white/85 text-lg max-w-xl">Put your website and booking page online today. Start free, add your services, and share one link with your customers. No tech skills needed.</p>
          <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/85 list-none p-0">
            {["Free plan", "No credit card", "Cancel anytime"].map((t) => (
              <li key={t} className="flex items-center gap-1.5"><Check size={15} aria-hidden /> {t}</li>
            ))}
          </ul>
          <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <AccentLink href="/signup">Start free</AccentLink>
            <DemoButton source="cta-demo" className="inline-flex items-center justify-center gap-2 min-h-12 border border-white/40 text-white hover:bg-white/10 font-semibold px-8 rounded-xl transition-colors text-base">
              Book a personal demo
            </DemoButton>
          </div>
        </div>
      </div>
    </section>
  );
}
