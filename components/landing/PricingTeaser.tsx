"use client";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useRegion } from "./useRegion";
import { formatMoney, getRegionPricing } from "@/lib/pricing";
import { Section, Heading } from "@/components/marketing/ui";
import { Reveal } from "@/components/marketing/Reveal";

/** A short pricing band for the home page, from the same region pricing as /pricing: names, prices, one line each. */
export function PricingTeaser() {
  const region = useRegion();
  const pricing = getRegionPricing(region);
  const yearly = region === "INTL"; // the same default as the pricing page: yearly for International, monthly for India
  return (
    <Section id="pricing" tone="card">
      <Reveal><Heading title="Simple, honest pricing" intro="Start free forever. Upgrade when you're ready for more." /></Reveal>
      <Reveal delay={0.08}>
        <div className="grid gap-4 md:grid-cols-3">
          {pricing.plans.map((plan) => {
            const free = plan.monthly === 0;
            const per = yearly ? plan.yearlyPerMonth : plan.monthly;
            return (
              <div key={plan.id} className={`mk-lift rounded-mk-card border bg-white p-7 ${plan.highlight ? "border-2 border-cv-blue" : "border-black/[0.08]"}`}>
                {plan.badge && <p className="m-0 mb-3 w-fit rounded-md bg-cv-marigold px-2.5 py-1 text-xs font-bold text-cv-ink">{plan.badge}</p>}
                <p className="m-0 font-display text-lg font-bold text-cv-ink">{plan.name}</p>
                <p className="m-0 mt-1 text-sm text-cv-mute">{plan.description}</p>
                <p className="m-0 mt-5 flex items-baseline gap-1"><span className="font-display text-4xl font-bold tracking-tight text-cv-ink">{formatMoney(per, pricing)}</span><span className="text-sm text-cv-mute">{free ? "forever" : "/mo"}</span></p>
              </div>
            );
          })}
        </div>
        <p className="mt-8 mb-0"><Link href="/pricing" className="mk-focus group inline-flex min-h-12 items-center gap-2 rounded-[14px] bg-cv-blue px-7 text-base font-semibold text-white transition hover:bg-cv-blue-dark [box-shadow:inset_0_1px_0_rgb(255_255_255/0.18),0_1px_2px_rgb(11_74_143/0.35),0_10px_24px_-8px_rgb(11_74_143/0.55)]">See pricing <ArrowRight size={17} className="transition-transform group-hover:translate-x-0.5" aria-hidden /></Link></p>
      </Reveal>
    </Section>
  );
}
