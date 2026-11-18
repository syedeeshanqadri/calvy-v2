"use client";
import { Bell, Check } from "lucide-react";
import { useRegion } from "@/components/landing/useRegion";

const DATA = {
  IN: { names: ["Priya N.", "Mohammed I.", "Kavita J."], first: "Priya", services: ["General Consultation", "Follow-up Visit", "Child Health Check"] },
  INTL: { names: ["Sarah R.", "Michael K.", "Ana L."], first: "Sarah", services: ["Haircut & Style", "Consultation", "Full Session"] },
} as const;

const card = "absolute rounded-mk-card border border-[rgba(15,23,42,0.06)] bg-white [box-shadow:var(--mk-shadow-card)]";

/** The "after" half of the before/after: a composed set of Calvy cards (today's list, a token, a reminder). Sample content. */
export function CalvyCards() {
  const region = useRegion();
  const d = DATA[region === "IN" ? "IN" : "INTL"];
  const status = ["Arrived", "Next", "Booked"];
  return (
    <div className="relative mx-auto h-[420px] w-full max-w-[480px] sm:h-[440px]" role="img" aria-label="Calvy: the day's bookings in one list, a queue number, and a reminder sent automatically">
      <div className={`${card} left-0 top-0 w-[86%] p-4 sm:p-5`}>
        <div className="mb-3 flex items-center justify-between"><p className="m-0 font-display text-base font-bold text-cv-ink">Today</p><p className="m-0 text-xs text-cv-mute">3 bookings</p></div>
        <div className="flex flex-col gap-2">
          {d.names.map((n, i) => (
            <div key={n} className="flex items-center gap-3 rounded-xl border border-cv-line/70 bg-cv-card p-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-cv-blue text-[11px] font-bold text-white">{n.split(" ").map((w) => w[0]).join("")}</span>
              <div className="min-w-0 flex-1"><p className="m-0 truncate text-sm font-semibold text-cv-ink">{n}</p><p className="m-0 truncate text-xs text-cv-mute">{["10:00 AM", "11:30 AM", "1:00 PM"][i]} · {d.services[i]}</p></div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${i === 0 ? "bg-cv-blue text-white" : i === 1 ? "bg-cv-marigold-tint text-cv-ink" : "bg-cv-blue-tint text-cv-blue"}`}>{status[i]}</span>
            </div>
          ))}
        </div>
      </div>
      <div className={`${card} bottom-[96px] right-0 w-[56%] p-4 mk-float sm:bottom-[88px]`} style={{ ["--mk-delay" as string]: "0.6s" }}>
        <p className="m-0 text-xs font-bold uppercase tracking-widest text-cv-mute">Your number</p>
        <div className="mt-1 flex items-baseline justify-between"><p className="m-0 font-display text-[38px] font-extrabold leading-none text-cv-blue">#14</p><p className="m-0 text-sm font-semibold text-cv-ink">3 ahead</p></div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-cv-blue-tint"><div className="h-full w-[72%] rounded-full bg-cv-blue" /></div>
      </div>
      <div className={`${card} bottom-0 left-[6%] flex w-[78%] items-start gap-3 p-4 mk-float`} style={{ ["--mk-delay" as string]: "1.8s" }}>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cv-blue-tint text-cv-blue"><Bell size={19} aria-hidden /></span>
        <div className="min-w-0"><p className="m-0 flex items-center gap-1.5 font-display text-base font-bold leading-tight text-cv-ink">Reminder sent <Check size={14} className="text-cv-blue" strokeWidth={3} aria-hidden /></p><p className="m-0 mt-1 text-sm text-cv-mute">{d.first} confirmed for tomorrow at 10:30 AM.</p></div>
      </div>
    </div>
  );
}
