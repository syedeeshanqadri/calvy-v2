"use client";
import Link from "next/link";
import { Check, ChevronDown } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { PRICING_NOTE, YEARLY_SAVE_BADGE, isFeatureHeading, type DisplayPlan } from "@/lib/pricingDisplay";

// Subscription (platform fee) is always priced in USD, regardless of the
// visitor's or tenant's local currency.
const usd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);

const FAQS = [
  { q: "Is the free plan really free forever?", a: "Yes. The free plan is lifetime free — no credit card required, no expiry date. You get a booking page and business website, email confirmations and reminders, and up to 60 appointments/month. Upgrade only when you need more." },
  { q: "I'm not technical. Can I set this up?", a: "Absolutely. Most businesses are up and running in under 10 minutes. No coding, no design work, no IT support needed. Sign up and your booking page is instantly ready to share." },
  { q: "I already have a website. Do I need to rebuild it?", a: "No. Your Calvy booking page works as a standalone link. Share it on Instagram, WhatsApp, or link to it from your existing site. Nothing needs to change on your end." },
  { q: "What if my clients prefer to call?", a: "They still can — Calvy adds an option, not a replacement. Most clients will choose to book online when given the chance. You'll get more bookings, not fewer." },
  { q: "Can I cancel anytime?", a: "Yes, anytime, no questions asked. There are no contracts, no setup fees, and no cancellation penalties. Downgrade to the free plan any time." },
];

function FAQ() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="max-w-2xl mx-auto mt-16">
      <h3 className="font-syne font-bold text-xl text-gray-900 text-center mb-6">Common questions</h3>
      <div className="space-y-3">
        {FAQS.map((faq, i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <button
              onClick={() => setOpen(open === i ? null : i)}
              className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50 transition-colors"
            >
              <span className="font-semibold text-gray-900 text-sm pr-4">{faq.q}</span>
              <ChevronDown size={16} className={cn("text-gray-500 flex-shrink-0 transition-transform duration-200", open === i && "rotate-180")} />
            </button>
            {open === i && (
              <div className="px-6 pb-5 text-sm text-gray-500 leading-relaxed border-t border-gray-100 pt-4">{faq.a}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PricingClient({ plans }: { plans: DisplayPlan[] }) {
  const [yearly, setYearly] = useState(true);

  return (
    <section id="pricing" className="py-16 sm:py-20 lg:py-24 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12 lg:mb-16">
          <span className="inline-block bg-sky-100 text-sky-700 text-xs font-bold tracking-widest uppercase px-4 py-2 rounded-full mb-4">Pricing</span>
          <h2 className="font-syne font-extrabold text-3xl sm:text-4xl lg:text-5xl tracking-tight text-gray-900 mb-4">Simple, honest pricing</h2>
          <p className="text-gray-500 text-lg max-w-md mx-auto mb-8">Start free forever. Upgrade when you&apos;re ready for more.</p>
          <div className="inline-flex items-center gap-1 bg-white rounded-full p-1.5 border border-gray-200 shadow-sm" role="group" aria-label="Billing period">
            <button onClick={() => setYearly(false)} aria-pressed={!yearly} className={cn("px-6 min-h-11 rounded-full text-sm font-semibold transition-all", !yearly ? "bg-gray-900 text-white shadow-sm" : "text-gray-500 hover:text-gray-900")}>
              Monthly
            </button>
            <button onClick={() => setYearly(true)} aria-pressed={yearly} className={cn("px-6 min-h-11 rounded-full text-sm font-semibold transition-all flex items-center gap-2", yearly ? "bg-gray-900 text-white shadow-sm" : "text-gray-500 hover:text-gray-900")}>
              Yearly <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">{YEARLY_SAVE_BADGE}</span>
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-6 items-stretch">
          {plans.map((plan) => {
            const free = plan.monthly === 0;
            const perMonth = yearly ? plan.yearlyPerMonth : plan.monthly;
            return (
              <div key={plan.id} className={cn("rounded-3xl p-8 flex flex-col border transition-all duration-300", plan.highlight ? "bg-gradient-to-br from-sky-600 to-sky-700 border-transparent shadow-2xl shadow-sky-200 md:scale-[1.03]" : "bg-white border-gray-200 hover:shadow-lg")}>
                {plan.badge && (
                  <div className="inline-flex mb-4">
                    <span className="text-xs font-bold bg-white/20 text-white px-3 py-1.5 rounded-full border border-white/30">{plan.badge}</span>
                  </div>
                )}
                <div className={cn("text-lg font-syne font-bold mb-1", plan.highlight ? "text-white" : "text-gray-900")}>{plan.name}</div>
                <p className={cn("text-sm mb-5 leading-relaxed", plan.highlight ? "text-sky-100" : "text-gray-500")}>{plan.description}</p>
                <div className="flex items-baseline gap-1 mb-2">
                  <span className={cn("font-syne font-extrabold text-5xl tracking-tight", plan.highlight ? "text-white" : "text-gray-900")}>
                    {usd(perMonth)}
                  </span>
                  <span className={cn("text-sm font-medium", plan.highlight ? "text-sky-200" : "text-gray-500")}>{free ? "forever" : "/mo"}</span>
                </div>
                <div className={cn("text-xs font-semibold mb-6 min-h-4", plan.highlight ? "text-sky-200" : "text-green-600")}>
                  {!free && yearly ? `billed ${usd(plan.yearlyTotal)} yearly` : ""}
                </div>
                <ul className="space-y-3 flex-1 mb-8">
                  {plan.features.map((f) =>
                    isFeatureHeading(f) ? (
                      <li key={f} className={cn("pt-2 text-xs font-bold uppercase tracking-wider", plan.highlight ? "text-white" : "text-gray-900")}>{f}</li>
                    ) : (
                      <li key={f} className="flex items-center gap-3">
                        <div className={cn("w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0", plan.highlight ? "bg-white/20" : "bg-sky-50")}>
                          <Check size={11} className={plan.highlight ? "text-white" : "text-sky-600"} strokeWidth={3} />
                        </div>
                        <span className={cn("text-sm", plan.highlight ? "text-sky-50" : "text-gray-600")}>{f}</span>
                      </li>
                    ),
                  )}
                </ul>
                <Link href="/signup" className={cn("w-full text-center font-semibold py-3.5 rounded-2xl transition-all text-sm min-h-11", plan.highlight ? "bg-white text-sky-700 hover:bg-sky-50" : "bg-sky-600 hover:bg-sky-700 text-white")}>
                  {free ? "Get started free" : `Get ${plan.name}`}
                </Link>
              </div>
            );
          })}
        </div>

        <p className="text-center text-sm text-gray-600 mt-8 font-medium">{PRICING_NOTE}</p>
        <p className="text-center text-sm text-gray-500 mt-2">No credit card required · Cancel anytime · Lifetime free plan available</p>
        <FAQ />
      </div>
    </section>
  );
}
