"use client";
import Link from "next/link";
import { Check, ChevronDown } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { PRICING_NOTE, WHATSAPP_NOTE, formatMoney, getRegionPricing, isFeatureHeading, yearlySaveBadge, type Region } from "@/lib/pricing";
import { useRegion } from "./useRegion";

const FREE_FAQ: Record<Region, string> = {
  INTL: "Yes. The free plan is lifetime free — no credit card required, no expiry date. You get a booking page and business website, email confirmations and reminders, and up to 60 appointments/month. Upgrade only when you need more.",
  IN: "Yes. The free plan is lifetime free — no monthly fee, no credit card required, no expiry date. You get unlimited bookings, a booking page and business website, and email notifications. Each confirmed online booking carries a nominal platform fee, paid by customers. Upgrade to Pro or Business to remove the fee.",
};

const faqs = (region: Region) => [
  { q: "Is the free plan really free forever?", a: FREE_FAQ[region] },
  { q: "I'm not technical. Can I set this up?", a: "Absolutely. Most businesses are up and running in under 10 minutes. No coding, no design work, no IT support needed. Sign up and your booking page is instantly ready to share." },
  { q: "I already have a website. Do I need to rebuild it?", a: "No. Your Calvy booking page works as a standalone link. Share it on Instagram, WhatsApp, or link to it from your existing site. Nothing needs to change on your end." },
  { q: "What if my clients prefer to call?", a: "They still can — Calvy adds an option, not a replacement. Most clients will choose to book online when given the chance. You'll get more bookings, not fewer." },
  { q: "Can I cancel anytime?", a: "Yes, anytime, no questions asked. There are no contracts, no setup fees, and no cancellation penalties. Downgrade to the free plan any time." },
];

function FAQ({ region }: { region: Region }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="max-w-2xl mt-16">
      <h2 className="font-display font-bold text-xl text-cv-ink mb-6">Common questions</h2>
      <div className="space-y-3">
        {faqs(region).map((faq, i) => (
          <div key={i} className="bg-cv-card rounded-xl border border-cv-line overflow-hidden">
            <button
              onClick={() => setOpen(open === i ? null : i)}
              className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-cv-paper transition-colors"
            >
              <span className="font-semibold text-cv-ink text-sm pr-4">{faq.q}</span>
              <ChevronDown size={16} className={cn("text-cv-mute flex-shrink-0 transition-transform duration-200", open === i && "rotate-180")} />
            </button>
            {open === i && (
              <div className="px-6 pb-5 text-sm text-cv-mute leading-relaxed border-t border-cv-line pt-4">{faq.a}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PricingClient({
  defaultRegion = "INTL",
  fixedRegion = false,
  headingLevel = "h2",
}: {
  /** Region rendered on the server; the visitor's cookie / detection replaces it unless fixedRegion */
  defaultRegion?: Region;
  /** India-only page: always shows defaultRegion */
  fixedRegion?: boolean;
  headingLevel?: "h1" | "h2";
}) {
  const region = useRegion(defaultRegion, fixedRegion);
  // Yearly is the default for International; India starts on monthly. Once the visitor picks one, that choice wins.
  const [choice, setChoice] = useState<boolean | null>(null);
  const yearly = choice ?? region === "INTL";
  const setYearly = setChoice;
  const pricing = getRegionPricing(region);
  const plans = pricing.plans;
  const money = (n: number) => formatMoney(n, pricing);
  const Heading = headingLevel;

  return (
    <section id="pricing" className="py-16 sm:py-20 lg:py-24 bg-cv-paper border-t border-cv-line">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mb-10 lg:mb-14">
          <Heading className="font-display font-bold text-3xl sm:text-4xl lg:text-[2.6rem] leading-[1.1] tracking-tight text-cv-ink mb-4 text-balance">Simple, honest pricing</Heading>
          <p className="text-cv-mute text-lg mb-8">Start free forever. Upgrade when you&apos;re ready for more.</p>
          <div className="inline-flex items-center gap-1 bg-cv-card rounded-xl p-1 border border-cv-line" role="group" aria-label="Billing period">
            <button onClick={() => setYearly(false)} aria-pressed={!yearly} className={cn("px-6 min-h-11 rounded-lg text-sm font-semibold transition-colors", !yearly ? "bg-cv-blue text-white" : "text-cv-mute hover:text-cv-ink")}>
              Monthly
            </button>
            <button onClick={() => setYearly(true)} aria-pressed={yearly} className={cn("px-6 min-h-11 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2", yearly ? "bg-cv-blue text-white" : "text-cv-mute hover:text-cv-ink")}>
              Yearly <span className={cn("text-xs font-bold", yearly ? "text-white" : "text-cv-blue")}>{yearlySaveBadge(plans)}</span>
            </button>
          </div>
          {pricing.headline && (
            <p className="mt-8 font-display font-bold text-xl sm:text-2xl text-cv-blue">{pricing.headline}</p>
          )}
        </div>

        <div className="grid md:grid-cols-3 gap-6 items-stretch">
          {plans.map((plan) => {
            const free = plan.monthly === 0;
            const perMonth = yearly ? plan.yearlyPerMonth : plan.monthly;
            return (
              <div key={plan.id} className={cn("rounded-xl p-8 flex flex-col border bg-cv-card", plan.highlight ? "border-2 border-cv-blue" : "border-cv-line")}>
                {plan.badge && (
                  <p className="m-0 mb-4 self-start rounded-md bg-cv-marigold px-2.5 py-1 text-xs font-bold text-cv-ink">{plan.badge}</p>
                )}
                <div className="text-lg font-display font-bold mb-1 text-cv-ink">{plan.name}</div>
                <p className="text-sm mb-5 leading-relaxed text-cv-mute">{plan.description}</p>
                <div className="flex items-baseline gap-1 mb-2">
                  <span className="font-display font-bold text-5xl tracking-tight text-cv-ink">{money(perMonth)}</span>
                  <span className="text-sm font-medium text-cv-mute">{free ? "forever" : "/mo"}</span>
                </div>
                <div className="text-xs font-semibold mb-6 min-h-4 text-cv-blue">
                  {!free && yearly ? `billed ${money(plan.yearlyTotal)} yearly` : ""}
                </div>
                <ul className="space-y-3 flex-1 mb-8 list-none p-0">
                  {plan.features.map((f) =>
                    isFeatureHeading(f) ? (
                      <li key={f} className="pt-2 text-xs font-bold uppercase tracking-wider text-cv-ink">{f}</li>
                    ) : (
                      <li key={f} className="flex items-start gap-3">
                        <Check size={16} className="mt-0.5 flex-shrink-0 text-cv-blue" strokeWidth={2.5} aria-hidden />
                        <span className="text-sm text-cv-mute">{f}</span>
                      </li>
                    ),
                  )}
                </ul>
                <Link href="/signup" className={cn("w-full text-center font-semibold py-3.5 rounded-xl transition-colors text-sm min-h-11", plan.highlight ? "bg-cv-blue hover:bg-cv-blue-dark text-white" : "border border-cv-blue text-cv-blue hover:bg-cv-blue-tint")}>
                  {free ? "Get started free" : `Get ${plan.name}`}
                </Link>
              </div>
            );
          })}
        </div>

        <p className="text-sm text-cv-ink mt-8 font-medium">{PRICING_NOTE}</p>
        <p className="text-sm text-cv-mute mt-2">{WHATSAPP_NOTE}</p>
        <p className="text-sm text-cv-mute mt-2">No credit card required · Cancel anytime · Lifetime free plan available</p>
        <FAQ region={region} />
      </div>
    </section>
  );
}
