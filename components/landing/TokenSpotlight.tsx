import { Check } from "lucide-react";
import { AtHomeScene } from "@/components/marketing/PackScenes";
import { Section } from "@/components/marketing/ui";
import { Reveal } from "@/components/marketing/Reveal";
import { BASE } from "@/lib/landingFeatures";
import { photosFor } from "@/lib/marketingConfig";
import { RegionPhoto } from "@/components/marketing/RegionPhoto";

/** The signature feature: the token queue. A person waiting at home, and the card that tells them their turn is coming. */
export function TokenSpotlight() {
  const f = BASE.find((x) => x.title === "Time slots and token queues")!;
  return (
    <Section tone="card" id="token-queue">
      <div className="grid items-center gap-14 lg:grid-cols-[1.1fr_1fr] lg:gap-20">
        <Reveal className="relative">
          <div className="relative aspect-[8/7] overflow-hidden rounded-mk-img bg-cv-blue">
            <RegionPhoto photos={photosFor("at-home")} sizes="(max-width: 1024px) 92vw, 50vw"><AtHomeScene className="absolute inset-0 h-full w-full" /></RegionPhoto>
          </div>
          <div className="absolute bottom-[-24px] right-4 w-[260px] rounded-mk-card border border-[rgba(15,23,42,0.06)] bg-white p-5 [box-shadow:var(--mk-shadow-card)] mk-float sm:right-[-24px] sm:w-[300px] sm:p-6">
            <p className="m-0 text-xs font-bold uppercase tracking-widest text-cv-mute">Your number</p>
            <div className="mt-1 flex items-baseline justify-between"><p className="m-0 font-display text-[56px] font-extrabold leading-none text-cv-blue">#14</p><p className="m-0 text-base font-semibold text-cv-ink">3 ahead</p></div>
            <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-cv-blue-tint"><div className="h-full w-[72%] rounded-full bg-cv-blue" /></div>
            <p className="m-0 mt-4 flex items-center gap-2 text-sm font-medium text-cv-ink"><Check size={16} className="text-cv-blue" strokeWidth={3} aria-hidden />We&apos;ll message you when it&apos;s your turn</p>
          </div>
        </Reveal>
        <Reveal delay={0.1}>
          <div>
            <h2 className="m-0 mb-5 font-display text-3xl font-bold leading-[1.08] tracking-[-0.02em] text-cv-ink text-balance sm:text-4xl lg:text-[2.75rem]">{f.title}</h2>
            <p className="mb-5 max-w-[46ch] text-lg leading-relaxed text-cv-mute">{f.desc}</p>
            <p className="m-0 flex items-center gap-2 text-sm font-semibold text-cv-ink"><Check size={16} className="text-cv-blue" strokeWidth={3} aria-hidden />{f.plan}</p>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
