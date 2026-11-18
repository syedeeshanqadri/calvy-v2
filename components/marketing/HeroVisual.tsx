"use client";
import Image from "next/image";
import { Check } from "lucide-react";
import { useRegion } from "@/components/landing/useRegion";
import { ReceptionScene } from "./Illustrations";

// Region-aware copy for the three floating cards: Indian names and INR for India, international names for everyone else.
const CARDS = {
  IN: { patient: "Priya Nair", clinic: "Sharma Family Clinic", first: "Priya", price: "₹500", time: "10:30 AM", sent: "9:00 AM" },
  INTL: { patient: "Emily Watson", clinic: "Riverside Family Clinic", first: "Emily", price: "$90", time: "10:30 AM", sent: "9:00 AM" },
} as const;

const floatCard = "absolute bg-cv-card rounded-mk-card border border-cv-line/70 [box-shadow:var(--mk-shadow-float)] mk-float";

/**
 * The hero's right side: a large rounded deep-blue panel with the drawn reception scene (or a photo when the photo flag is on and a
 * file exists), and three coded cards floating over it. Cards are UI, not pictures of data: no revenue figures.
 */
export function HeroVisual({ photos }: { photos: { IN: string | null; INTL: string | null } }) {
  const region = useRegion();
  const c = CARDS[region === "IN" ? "IN" : "INTL"];
  const photo = photos[region === "IN" ? "IN" : "INTL"];
  return (
    <div className="relative mx-auto w-full max-w-[520px] lg:max-w-none pb-10 lg:pb-0">
      <div className="relative h-[440px] sm:h-[480px] lg:h-[580px] overflow-hidden rounded-mk-img bg-cv-blue">
        {photo
          ? <Image src={photo} alt="" fill priority sizes="(max-width: 1024px) 92vw, 45vw" className="object-cover" />
          : <ReceptionScene className="absolute inset-0 h-full w-full" />}
      </div>

      {/* 1. booking confirmed */}
      <div className={`${floatCard} left-[-4px] top-5 sm:left-[-18px] sm:top-10 w-[212px] sm:w-[250px] p-3 sm:p-4`} style={{ ["--mk-delay" as string]: "0s" }}>
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-cv-blue text-white"><Check size={18} strokeWidth={3} aria-hidden /></span>
          <div className="min-w-0">
            <p className="m-0 font-display font-bold text-[15px] leading-tight text-cv-ink">Booking confirmed</p>
            <p className="m-0 mt-0.5 text-[13px] text-cv-mute">{c.time} · {c.patient}</p>
            <p className="m-0 text-[12px] text-cv-mute">General Consultation · {c.price}</p>
          </div>
        </div>
      </div>

      {/* 2. token + progress */}
      <div className={`${floatCard} right-[-4px] top-[46%] sm:top-[38%] sm:right-[-20px] w-[178px] sm:w-[220px] p-3 sm:p-4`} style={{ ["--mk-delay" as string]: "1.4s" }}>
        <p className="m-0 text-[11px] font-bold uppercase tracking-widest text-cv-mute">Your number</p>
        <div className="mt-1 flex items-baseline justify-between gap-2">
          <p className="m-0 font-display font-extrabold text-[40px] leading-none text-cv-blue">#14</p>
          <p className="m-0 text-[13px] font-semibold text-cv-ink">3 ahead</p>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-cv-blue-tint" role="img" aria-label="Three people ahead of you"><div className="h-full w-[72%] rounded-full bg-cv-blue" /></div>
      </div>

      {/* 3. reminder, as a generic chat bubble */}
      <div className={`${floatCard} bottom-0 left-3 sm:bottom-8 sm:left-[-10px] w-[250px] sm:w-[280px] p-3 sm:p-3.5`} style={{ ["--mk-delay" as string]: "2.6s" }}>
        <div className="mb-2 flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-cv-blue text-[11px] font-bold text-white" aria-hidden>{c.clinic[0]}</span>
          <p className="m-0 truncate text-[12px] font-semibold text-cv-ink">{c.clinic}</p>
          <p className="m-0 ml-auto text-[11px] text-cv-mute">{c.sent}</p>
        </div>
        <p className="m-0 rounded-[14px] rounded-tl-[4px] bg-cv-blue-tint px-3 py-2 text-[13px] leading-snug text-cv-ink">Hi {c.first}, your appointment is tomorrow at {c.time}. See you then.</p>
      </div>
    </div>
  );
}
