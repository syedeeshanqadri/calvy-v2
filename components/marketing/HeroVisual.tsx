"use client";
import Image from "next/image";
import { Check } from "lucide-react";
import { useRegion } from "@/components/landing/useRegion";
import { RegionImage } from "./RegionImage";

// Region-aware copy for the three floating cards: Indian names and INR for India, international names for everyone else.
const CARDS = {
  IN: { patient: "Priya Nair", clinic: "Sharma Family Clinic", first: "Priya", price: "₹500", time: "10:30 AM", sent: "9:00 AM" },
  INTL: { patient: "Emily Watson", clinic: "Riverside Family Clinic", first: "Emily", price: "$90", time: "10:30 AM", sent: "9:00 AM" },
} as const;

const floatCard = "absolute rounded-mk-card border border-[rgba(15,23,42,0.06)] bg-white [box-shadow:var(--mk-shadow-card)] mk-float";

/** One real screenshot of the product in a phone outline: the customer's booking page, or the owner's Today list. */
function PhoneShot({ name, alt, className = "", priority = false }: { name: string; alt: string; className?: string; priority?: boolean }) {
  return (
    <div className={`absolute rounded-[30px] border-2 border-cv-ink bg-cv-ink p-[7px] [box-shadow:0_30px_60px_-20px_rgb(0_0_0/0.45)] ${className}`}>
      <div className="overflow-hidden rounded-[23px] bg-white">
        <RegionImage name={name} alt={alt} width={520} height={1125} priority={priority} className="block h-auto w-full" />
      </div>
    </div>
  );
}

/**
 * The hero's visual: a deep-blue panel on a soft brand-tinted arch, holding two real product screens in phone outlines (the
 * customer's booking page and the owner's Today list, from the demo accounts of the visitor's region), with three coded cards
 * floating over it. If the photo flag is on and a hero photo exists, the photo replaces the phones.
 */
export function HeroVisual({ photos }: { photos: { IN: string | null; INTL: string | null } }) {
  const region = useRegion();
  const c = CARDS[region === "IN" ? "IN" : "INTL"];
  const photo = photos[region === "IN" ? "IN" : "INTL"];
  return (
    <div className="relative mx-auto w-full max-w-[560px] lg:mx-0 lg:max-w-none lg:-mr-4 xl:-mr-24">
      <div aria-hidden className="absolute -right-6 -top-8 bottom-[-24px] left-10 rounded-t-[999px] rounded-b-[40px] bg-cv-blue/[0.12] max-lg:hidden" />
      <div className="relative h-[480px] overflow-hidden rounded-mk-img bg-cv-blue sm:h-[540px] lg:h-[640px]">
        {photo ? (
          <Image src={photo} alt="" fill priority sizes="(max-width: 1024px) 92vw, 50vw" className="object-cover" />
        ) : (
          <>
            {/* flat light shapes behind the phones (window light), no glow */}
            <div aria-hidden className="absolute -right-10 top-0 h-full w-[46%] -skew-x-6 bg-[#1B62AD]/60" />
            <PhoneShot name="booking" alt="A Calvy booking page on a phone: choose a service, then a time" priority className="left-1/2 top-[88px] w-[54%] max-w-[280px] -translate-x-[62%] sm:top-12 sm:w-[50%] lg:top-12" />
            <PhoneShot name="today" alt="The Calvy Today list on a phone: the day's bookings with Arrived, Completed and No-show buttons" className="hidden sm:block right-[7%] bottom-[-84px] w-[38%] max-w-[200px] lg:bottom-[-110px]" />
          </>
        )}
      </div>

      {/* 1. booking confirmed */}
      <div className={`${floatCard} left-[-4px] top-5 w-[212px] p-3.5 sm:left-[-48px] sm:top-14 sm:w-[264px] sm:p-[18px] lg:left-[-80px]`} style={{ ["--mk-delay" as string]: "0s" }}>
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-cv-blue text-white"><Check size={20} strokeWidth={3} aria-hidden /></span>
          <div className="min-w-0">
            <p className="m-0 font-display font-bold text-base leading-tight text-cv-ink">Booking confirmed</p>
            <p className="m-0 mt-1 text-sm text-cv-mute">{c.time} · {c.patient}</p>
            <p className="m-0 text-[13px] text-cv-mute">General Consultation · {c.price}</p>
          </div>
        </div>
      </div>

      {/* 2. token + progress */}
      <div className={`${floatCard} right-[-4px] top-[54%] w-[168px] p-3 sm:right-[-36px] sm:top-[34%] sm:w-[232px] sm:p-[18px] lg:right-[-76px]`} style={{ ["--mk-delay" as string]: "1.4s" }}>
        <p className="m-0 text-xs font-bold uppercase tracking-widest text-cv-mute">Your number</p>
        <div className="mt-1 flex items-baseline justify-between gap-2">
          <p className="m-0 font-display font-extrabold text-[44px] leading-none text-cv-blue">#14</p>
          <p className="m-0 text-sm font-semibold text-cv-ink">3 ahead</p>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-cv-blue-tint" role="img" aria-label="Three people ahead of you"><div className="h-full w-[72%] rounded-full bg-cv-blue" /></div>
      </div>

      {/* 3. reminder, as a generic chat bubble */}
      <div className={`${floatCard} hidden sm:block sm:bottom-14 sm:left-[-40px] sm:w-[296px] sm:p-4 lg:left-[-72px]`} style={{ ["--mk-delay" as string]: "2.6s" }}>
        <div className="mb-2 flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-cv-blue text-xs font-bold text-white" aria-hidden>{c.clinic[0]}</span>
          <p className="m-0 truncate text-[13px] font-semibold text-cv-ink">{c.clinic}</p>
          <p className="m-0 ml-auto text-xs text-cv-mute">{c.sent}</p>
        </div>
        <p className="m-0 rounded-[14px] rounded-tl-[4px] bg-cv-blue-tint px-3.5 py-2.5 text-sm leading-snug text-cv-ink">Hi {c.first}, your appointment is tomorrow at {c.time}. See you then.</p>
      </div>
    </div>
  );
}
