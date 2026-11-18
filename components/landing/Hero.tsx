import { Check, ArrowRight } from "lucide-react";
import { DemoButton } from "./DemoButton";
import { PrimaryLink, WRAP } from "@/components/marketing/ui";
import { HeroVisual } from "@/components/marketing/HeroVisual";
import { photoFor } from "@/lib/marketingConfig";

/* Hero: left-aligned headline with one marigold underline, split ~55/45 with a drawn reception scene and three floating UI cards. */
export function Hero() {
  const photos = { IN: photoFor("hero-doctor", "india"), INTL: photoFor("hero-doctor", "intl") };
  return (
    <section className="mk mk-paper pt-16">
      <div className={`${WRAP} py-10 sm:py-14 lg:py-20`}>
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[11fr_9fr] lg:gap-14">
          <div className="min-w-0">
            <h1 className="mb-6 font-display font-bold text-[40px] leading-[1.04] tracking-[-0.02em] text-cv-ink sm:text-[56px] lg:text-[68px] lg:leading-[1.02] text-balance">
              Your clients book,{" "}
              <span className="mk-underline">pay &amp; show up</span>
              {" "}— on autopilot
            </h1>
            <p className="mb-8 max-w-xl text-lg leading-relaxed text-cv-mute sm:text-xl">
              Build your business website and online booking page for free. Time slots or token queues, reminders on email, WhatsApp and push, and online payments, ready in minutes.
            </p>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
              <PrimaryLink href="/signup" className="w-full sm:w-auto">Get started for free</PrimaryLink>
              <DemoButton source="hero-demo" className="mk-focus inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-cv-blue underline-offset-4 hover:underline">
                Or book a personal demo <ArrowRight size={15} aria-hidden />
              </DemoButton>
            </div>
            <p className="mt-3 mb-0 text-xs text-cv-mute">No credit card · Free forever plan · Setup in 60 seconds</p>
            <ul className="m-0 mt-7 flex list-none flex-wrap gap-x-6 gap-y-2 p-0">
              {["Free forever plan", "No credit card required", "Cancel anytime"].map((t) => (
                <li key={t} className="flex items-center gap-2 text-sm font-medium text-cv-ink">
                  <Check size={16} className="shrink-0 text-cv-blue" strokeWidth={2.75} aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
            <p className="mt-6 mb-0 text-sm text-cv-mute">Free booking page and website for service businesses</p>
          </div>
          <div className="min-w-0"><HeroVisual photos={photos} /></div>
        </div>
      </div>
    </section>
  );
}
