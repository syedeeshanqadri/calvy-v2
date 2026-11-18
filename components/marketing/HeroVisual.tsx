"use client";
import Image from "next/image";
import { Check } from "lucide-react";
import { useRegion } from "@/components/landing/useRegion";
import { ReceptionScene } from "./Illustrations";

export type HeroVariant = "A" | "B" | "C";

// Region-aware copy for the three floating cards: Indian names and INR for India, international names for everyone else.
const CARDS = {
  IN: { patient: "Priya Nair", clinic: "Sharma Family Clinic", first: "Priya", price: "₹500", time: "10:30 AM", sent: "9:00 AM" },
  INTL: { patient: "Emily Watson", clinic: "Riverside Family Clinic", first: "Emily", price: "$90", time: "10:30 AM", sent: "9:00 AM" },
} as const;

const floatCard = "absolute rounded-mk-card border border-[rgba(15,23,42,0.06)] bg-white [box-shadow:var(--mk-shadow-card)] mk-float";

/**
 * The hero's visual: a large panel with the drawn reception scene (or a photo when the photo flag is on and a file exists) and
 * three coded cards over it. Variant A: deep-blue panel on a soft arch. B: cream panel (the section is navy). C: the panel is
 * the whole right half of the hero, bleeding to the screen edge, with the cards straddling the seam.
 */
export function HeroVisual({ photos, variant = "A" }: { photos: { IN: string | null; INTL: string | null }; variant?: HeroVariant }) {
  const region = useRegion();
  const c = CARDS[region === "IN" ? "IN" : "INTL"];
  const photo = photos[region === "IN" ? "IN" : "INTL"];
  const light = variant === "B";
  const panel = photo
    ? <Image src={photo} alt="" fill priority sizes="(max-width: 1024px) 92vw, 50vw" className="object-cover" />
    : <ReceptionScene className="absolute inset-0 h-full w-full" tone={light ? "light" : "dark"} />;

  // Positions differ by variant; the cards themselves are identical.
  const pos = variant === "C"
    ? { booking: "left-4 top-6 sm:left-8 lg:left-[-72px] lg:top-24", token: "right-4 top-[46%] sm:right-10 lg:right-[8%] lg:top-[34%]", bubble: "bottom-4 left-4 sm:left-8 lg:left-[-48px] lg:bottom-28" }
    : { booking: "left-[-4px] top-5 sm:left-[-24px] sm:top-12", token: "right-[-4px] top-[46%] sm:right-[-28px] sm:top-[36%]", bubble: "bottom-0 left-3 sm:bottom-10 sm:left-[-16px]" };

  return (
    <div className={variant === "C" ? "relative h-[460px] sm:h-[520px] lg:h-full lg:min-h-[640px]" : "relative mx-auto w-full max-w-[560px] lg:mx-0 lg:max-w-none lg:-mr-4 xl:-mr-24"}>
      {variant === "A" && <div aria-hidden className="absolute -right-6 -top-8 bottom-[-24px] left-10 rounded-t-[999px] rounded-b-[40px] bg-cv-blue/[0.12] max-lg:hidden" />}
      <div className={variant === "C"
        ? "absolute inset-0 overflow-hidden bg-cv-blue"
        : `relative h-[448px] sm:h-[512px] lg:h-[640px] overflow-hidden rounded-mk-img ${light ? "bg-[#F4EFE6]" : "bg-cv-blue"}`}>
        {panel}
      </div>

      {/* 1. booking confirmed */}
      <div className={`${floatCard} ${pos.booking} w-[224px] sm:w-[264px] p-3.5 sm:p-[18px]`} style={{ ["--mk-delay" as string]: "0s" }}>
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
      <div className={`${floatCard} ${pos.token} w-[184px] sm:w-[232px] p-3.5 sm:p-[18px]`} style={{ ["--mk-delay" as string]: "1.4s" }}>
        <p className="m-0 text-xs font-bold uppercase tracking-widest text-cv-mute">Your number</p>
        <div className="mt-1 flex items-baseline justify-between gap-2">
          <p className="m-0 font-display font-extrabold text-[44px] leading-none text-cv-blue">#14</p>
          <p className="m-0 text-sm font-semibold text-cv-ink">3 ahead</p>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-cv-blue-tint" role="img" aria-label="Three people ahead of you"><div className="h-full w-[72%] rounded-full bg-cv-blue" /></div>
      </div>

      {/* 3. reminder, as a generic chat bubble */}
      <div className={`${floatCard} ${pos.bubble} w-[256px] sm:w-[296px] p-3 sm:p-4`} style={{ ["--mk-delay" as string]: "2.6s" }}>
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
