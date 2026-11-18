"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { Briefcase, Check, Dumbbell, Scale, Scissors, Stethoscope, UserRound, Video, Users, CalendarCheck, type LucideIcon } from "lucide-react";
import { useRegion } from "@/components/landing/useRegion";
import { ClinicScene, ConsultScene, GymScene, LawScene, SalonScene, ShopScene } from "./PackScenes";
import type { PackId } from "@/lib/packs/types";

export interface ShowcasePack { id: PackId; label: string; title: string; bullets: string[]; href: string | null; more: string; photos: { IN: string | null; INTL: string | null } }

const ICON: Record<PackId, LucideIcon> = { CLINIC: Stethoscope, SALON_SPA: Scissors, LAWYER: Scale, FITNESS: Dumbbell, CONSULTANT: UserRound, OTHER: Briefcase };
const SCENE: Record<PackId, (p: { className?: string }) => ReactNode> = { CLINIC: ClinicScene, SALON_SPA: SalonScene, LAWYER: LawScene, FITNESS: GymScene, CONSULTANT: ConsultScene, OTHER: ShopScene };

const card = "absolute rounded-mk-card border border-[rgba(15,23,42,0.06)] bg-white [box-shadow:var(--mk-shadow-card)] mk-float";

/** The pack-specific floating card: a small piece of the product that fits the kind of business. */
function PackCard({ id, pos }: { id: PackId; pos: string }) {
  const icon = "grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cv-blue-tint text-cv-blue";
  if (id === "CLINIC") {
    return (
      <div className={`${card} ${pos} w-[220px] p-4`}>
        <p className="m-0 text-xs font-bold uppercase tracking-widest text-cv-mute">Your number</p>
        <div className="mt-1 flex items-baseline justify-between"><p className="m-0 font-display text-[40px] font-extrabold leading-none text-cv-blue">#14</p><p className="m-0 text-sm font-semibold text-cv-ink">3 ahead</p></div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-cv-blue-tint"><div className="h-full w-[72%] rounded-full bg-cv-blue" /></div>
      </div>
    );
  }
  const rows: Record<Exclude<PackId, "CLINIC">, { Icon: LucideIcon; t: string; s: string }> = {
    SALON_SPA: { Icon: CalendarCheck, t: "Booking confirmed", s: "10:30 AM · with your stylist" },
    LAWYER: { Icon: Scale, t: "Consultation booked", s: "Thursday 4:00 PM · online or in person" },
    FITNESS: { Icon: Users, t: "Group class", s: "Saturday 7:00 AM · 2 spots left" },
    CONSULTANT: { Icon: Video, t: "Video session", s: "Tuesday 11:00 AM · link sent" },
    OTHER: { Icon: CalendarCheck, t: "New booking", s: "Monday 3:30 PM · confirmed" },
  };
  const r = rows[id];
  return (
    <div className={`${card} ${pos} flex w-[270px] items-start gap-3 p-4`}>
      <span className={icon}><r.Icon size={20} aria-hidden /></span>
      <div className="min-w-0"><p className="m-0 font-display text-base font-bold leading-tight text-cv-ink">{r.t}</p><p className="m-0 mt-1 text-sm text-cv-mute">{r.s}</p></div>
    </div>
  );
}

/** One tabbed showcase for the kinds of business: auto-rotates, pauses on hover and focus, swipes on phones. */
export function PackShowcase({ packs }: { packs: ShowcasePack[] }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchX = useRef<number | null>(null);
  const region = useRegion();
  const go = useCallback((i: number) => setActive((i + packs.length) % packs.length), [packs.length]);

  useEffect(() => {
    if (paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setTimeout(() => setActive((a) => (a + 1) % packs.length), 6500);
    return () => clearTimeout(t);
  }, [active, paused, packs.length]);

  const p = packs[active];
  const Scene = SCENE[p.id];
  const photo = p.photos[region === "IN" ? "IN" : "INTL"];
  return (
    <div onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}
      onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => { if (touchX.current === null) return; const dx = e.changedTouches[0].clientX - touchX.current; if (Math.abs(dx) > 50) go(active + (dx < 0 ? 1 : -1)); touchX.current = null; }}>
      <div role="tablist" aria-label="Kinds of business" className="-mx-4 mb-8 flex gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        {packs.map((x, i) => {
          const Icon = ICON[x.id];
          return (
            <button key={x.id} role="tab" id={`pack-tab-${x.id}`} aria-selected={i === active} aria-controls="pack-panel" tabIndex={i === active ? 0 : -1} onClick={() => setActive(i)}
              onKeyDown={(e) => { if (e.key === "ArrowRight") { go(active + 1); e.preventDefault(); } if (e.key === "ArrowLeft") { go(active - 1); e.preventDefault(); } }}
              className={`mk-focus inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors ${i === active ? "border-cv-blue bg-cv-blue text-white" : "border-cv-line bg-cv-card text-cv-ink hover:border-cv-blue"}`}>
              <Icon size={16} aria-hidden /> {x.label}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id="pack-panel" aria-labelledby={`pack-tab-${p.id}`} className="grid items-center gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
        <div className="relative">
          <div className="relative aspect-[8/7] overflow-hidden rounded-mk-img bg-cv-blue">
            {photo ? <Image src={photo} alt="" fill sizes="(max-width: 1024px) 92vw, 50vw" className="object-cover" /> : <Scene className="absolute inset-0 h-full w-full" />}
          </div>
          <PackCard id={p.id} pos="bottom-[-20px] left-4 sm:left-[-24px] sm:bottom-10" />
        </div>
        <div key={p.id} className="mk-reveal is-in">
          <h3 className="m-0 mb-5 font-display text-3xl font-bold leading-tight tracking-[-0.02em] text-cv-ink text-balance sm:text-4xl">{p.title}</h3>
          <ul className="m-0 mb-6 flex list-none flex-col gap-3 p-0">
            {p.bullets.map((b) => (
              <li key={b} className="flex items-start gap-3 text-[17px] leading-relaxed text-cv-mute"><Check size={18} className="mt-1 shrink-0 text-cv-blue" strokeWidth={2.75} aria-hidden />{b}</li>
            ))}
          </ul>
          {p.href && <Link href={p.href} className="mk-focus inline-flex min-h-11 items-center text-[15px] font-semibold text-cv-blue underline underline-offset-4">{p.more}</Link>}
        </div>
      </div>
    </div>
  );
}
