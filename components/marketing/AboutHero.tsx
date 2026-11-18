import type { ReactNode } from "react";
import { Bell, Check } from "lucide-react";
import { WRAP } from "@/components/marketing/ui";
import { RegionPhoto } from "@/components/marketing/RegionPhoto";
import { photosFor } from "@/lib/marketingConfig";

const card = "rounded-mk-card border border-[rgba(15,23,42,0.06)] bg-white [box-shadow:var(--mk-shadow-card)]";

/** About page hero: large headline with the marigold underline, and the photo in a framed panel with two small UI cards. */
export function AboutHero({ title, intro, children }: { title: string; intro: string; children?: ReactNode }) {
  const photos = photosFor("about");
  return (
    <section className="mk relative overflow-hidden border-b border-black/[0.06] bg-[#FBFBFA] pt-28 pb-20 sm:pt-32 sm:pb-24 lg:pb-28">
      <div className={`${WRAP} grid items-center gap-14 lg:grid-cols-[1.12fr_1fr] lg:gap-16`}>
        <div className="min-w-0">
          <h1 className="m-0 font-display text-[2.5rem] font-bold leading-[1.04] tracking-[-0.03em] text-cv-ink text-balance sm:text-6xl lg:text-[3.5rem]">{title}</h1>
          <p className="mt-6 max-w-[34ch] text-lg leading-relaxed text-cv-mute sm:text-xl">{intro}</p>
          {children}
        </div>
        <div className="relative mx-auto w-full max-w-[560px] lg:max-w-none">
          <div aria-hidden className="absolute -right-4 -bottom-4 h-full w-full rounded-mk-img bg-cv-blue/10 sm:-right-6 sm:-bottom-6" />
          <div className="relative aspect-[5/4] overflow-hidden rounded-mk-img bg-cv-blue [box-shadow:0_30px_60px_-30px_rgb(11_74_143/0.45)]">
            <RegionPhoto photos={photos} position="35% 40%" sizes="(max-width: 1024px) 92vw, 46vw"><span /></RegionPhoto>
            <div aria-hidden className="absolute inset-0 bg-gradient-to-tr from-cv-blue/45 via-cv-blue/10 to-transparent" />
          </div>
          <div className={`${card} mk-float absolute -left-3 bottom-8 flex items-center gap-3 p-4 sm:-left-8`}>
            <span className="grid h-10 w-10 place-items-center rounded-full bg-cv-blue text-white"><Check size={18} strokeWidth={3} aria-hidden /></span>
            <div><p className="m-0 font-display text-base font-bold text-cv-ink">Booking confirmed</p><p className="m-0 text-sm text-cv-mute">Tomorrow, 10:30 AM</p></div>
          </div>
          <div className={`${card} mk-float absolute -top-4 right-2 flex items-center gap-3 p-3.5 sm:right-[-1.5rem]`} style={{ animationDelay: "1.2s" }}>
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-cv-blue-tint text-cv-blue"><Bell size={17} aria-hidden /></span>
            <p className="m-0 text-sm font-semibold text-cv-ink">Reminder sent <Check size={13} className="inline text-cv-blue" aria-hidden /></p>
          </div>
        </div>
      </div>
    </section>
  );
}
