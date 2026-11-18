import { Check, ArrowRight } from "lucide-react";
import Link from "next/link";
import { DemoButton } from "./DemoButton";
import { HeroVisual } from "@/components/marketing/HeroVisual";
import { photoFor } from "@/lib/marketingConfig";

const BTN = "mk-focus group inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[14px] px-8 text-base font-semibold transition sm:w-auto";
const PRIMARY = `${BTN} bg-cv-blue text-white hover:bg-cv-blue-dark [box-shadow:inset_0_1px_0_rgb(255_255_255/0.18),0_1px_2px_rgb(11_74_143/0.35),0_10px_24px_-8px_rgb(11_74_143/0.55)]`;

/** Left column: headline, subtext, one button and a text link, the trust row. Same copy in every variant. */
function HeroCopy() {
  return (
    <div className="min-w-0">
      <h1 className={`mb-6 font-display font-bold text-[40px] leading-[1.05] tracking-[-0.03em] sm:text-[56px] lg:text-[68px] text-balance text-cv-ink`}>
        Your clients book,{" "}
        <span className="mk-underline">pay &amp; show up</span>
        {" "}— on autopilot
      </h1>
      <p className={`mb-8 max-w-[34ch] text-lg leading-[1.6] text-cv-mute`}>
        Build your business website and online booking page for free. Time slots or token queues, reminders on email, WhatsApp and push, and online payments, ready in minutes.
      </p>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-8">
        <Link href="/signup" className={PRIMARY}>
          Get started for free <ArrowRight size={18} className="transition-transform group-hover:translate-x-0.5" aria-hidden />
        </Link>
        <DemoButton source="hero-demo" className={`mk-focus inline-flex min-h-[52px] items-center gap-1.5 text-[15px] font-semibold underline-offset-4 hover:underline text-cv-blue`}>
          Or book a personal demo <ArrowRight size={16} aria-hidden />
        </DemoButton>
      </div>
      <p className={`mt-3 mb-0 text-xs text-cv-mute`}>No credit card · Free forever plan · Setup in 60 seconds</p>
      <ul className="m-0 mt-8 flex list-none flex-wrap gap-x-6 gap-y-2 p-0">
        {["Free forever plan", "No credit card required", "Cancel anytime"].map((t) => (
          <li key={t} className={`flex items-center gap-2 text-sm font-medium text-cv-ink`}>
            <Check size={16} className={`shrink-0 text-cv-blue`} strokeWidth={2.75} aria-hidden />
            {t}
          </li>
        ))}
      </ul>
      <p className={`mt-6 mb-0 text-sm text-cv-mute`}>Free booking page and website for service businesses</p>
    </div>
  );
}

/** Hero: near-white, a hairline underneath, the headline on the left and the visual (real screens on a soft arch) on the right. */
export function Hero() {
  const photos = { IN: photoFor("hero-doctor", "india"), INTL: photoFor("hero-doctor", "intl") };
  return (
    <section className="mk border-b border-black/[0.06] bg-[#FBFBFA] pt-16">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-28">
        <div className="grid grid-cols-1 items-start gap-16 lg:grid-cols-[11fr_9fr] lg:gap-12">
          <HeroCopy />
          <div className="min-w-0"><HeroVisual photos={photos} /></div>
        </div>
      </div>
    </section>
  );
}
