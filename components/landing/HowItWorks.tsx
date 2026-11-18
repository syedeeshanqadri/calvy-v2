"use client";
import { Zap, Link2, TrendingUp, Check, Copy } from "lucide-react";
import { Section, Heading, Icon } from "@/components/marketing/ui";
import { Reveal } from "@/components/marketing/Reveal";
import { useRegion } from "./useRegion";

const STEPS = [
  { num: "01", title: "Set up your profile", desc: "Add your services, pricing, team, and working hours. Takes under 10 minutes. No technical skills needed.", tag: "10 min setup", Icon: Zap },
  { num: "02", title: "Share your booking link", desc: "Send your unique link via Instagram, WhatsApp, email signature, or embed it on your website.", tag: "1-click sharing", Icon: Link2 },
  { num: "03", title: "Get booked & paid", desc: "Clients self-book 24/7. Reminders go out automatically. Payments collected upfront. You just show up.", tag: "24/7 bookings", Icon: TrendingUp },
];

const SAMPLE = {
  IN: { name: "Sharma Family Clinic", slug: "sharma-clinic", rows: [["General Consultation", "₹500"], ["Follow-up Visit", "₹300"], ["Child Health Check", "₹600"]], who: "Priya N." },
  INTL: { name: "Glow Beauty Studio", slug: "glow-studio", rows: [["Haircut & Style", "$45"], ["Beard Trim", "$20"], ["Hair Treatment", "$35"]], who: "Sarah R." },
} as const;

const card = "h-full rounded-mk-card border border-[rgba(15,23,42,0.06)] bg-white p-4 [box-shadow:var(--mk-shadow-card)]";

/** Three steps on a connected line, each with a small coded card: the profile, the link, the booking. Sample content. */
export function HowItWorks() {
  const region = useRegion();
  const d = SAMPLE[region === "IN" ? "IN" : "INTL"];
  const visuals = [
    <div key="v1" className={card}>
      <div className="mb-3 flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-cv-blue text-xs font-bold text-white">{d.name[0]}</span><p className="m-0 text-sm font-semibold text-cv-ink">{d.name}</p></div>
      {d.rows.map(([n, p]) => <div key={n} className="flex items-center justify-between border-t border-cv-line/70 py-2 text-sm"><span className="text-cv-ink">{n}</span><span className="font-semibold text-cv-blue">{p}</span></div>)}
    </div>,
    <div key="v2" className={card}>
      <p className="m-0 mb-2 text-xs font-semibold text-cv-mute">Your booking link</p>
      <div className="flex items-center gap-2 rounded-xl border border-cv-line bg-cv-paper px-3 py-2.5"><span className="min-w-0 flex-1 truncate text-sm text-cv-ink">calvy.io/{d.slug}</span><span className="grid h-7 w-7 place-items-center rounded-lg bg-cv-blue text-white"><Copy size={13} aria-hidden /></span></div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-cv-blue">{["WhatsApp", "Instagram", "Email", "Your website"].map((c) => <span key={c} className="rounded-full bg-cv-blue-tint px-2.5 py-1">{c}</span>)}</div>
    </div>,
    <div key="v3" className={card}>
      <div className="flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-cv-blue text-white"><Check size={17} strokeWidth={3} aria-hidden /></span><div><p className="m-0 font-display text-base font-bold text-cv-ink">Booking confirmed</p><p className="m-0 mt-0.5 text-sm text-cv-mute">{d.who} · tomorrow 10:30 AM</p></div></div>
      <div className="mt-3 flex items-center justify-between rounded-xl bg-cv-blue-tint px-3 py-2 text-xs font-semibold text-cv-blue"><span>Reminder scheduled</span><span>Paid online</span></div>
    </div>,
  ];
  return (
    <Section id="how-it-works" tone="paper">
      <Reveal><Heading title="Up and running in 3 steps" intro="No setup fees. No training required. No IT department needed." /></Reveal>
      <ol className="m-0 grid list-none gap-12 p-0 lg:grid-cols-3 lg:gap-0">
        {STEPS.map((step, i) => (
          <li key={step.num} className="min-w-0 lg:px-5">
            <Reveal delay={i * 0.1}>
              <div className="mx-auto h-[186px] max-w-[340px]">{visuals[i]}</div>
              <div className="relative mt-6 flex h-11 items-center justify-center">
                <span aria-hidden className={`absolute top-1/2 hidden h-px bg-cv-blue/30 lg:block ${i === 0 ? "left-1/2 right-[-1.25rem]" : i === STEPS.length - 1 ? "left-[-1.25rem] right-1/2" : "left-[-1.25rem] right-[-1.25rem]"}`} />
                <span className="relative z-10 grid h-11 w-11 place-items-center rounded-full border-2 border-cv-blue bg-white font-display text-sm font-bold text-cv-blue">{step.num}</span>
              </div>
              <div className="mx-auto mt-4 max-w-[340px] lg:text-center">
                <h3 className="mt-0 mb-2 font-display text-xl font-bold text-cv-ink">{step.title}</h3>
                <p className="m-0 mb-3 leading-relaxed text-cv-mute">{step.desc}</p>
                <p className="m-0 inline-flex items-center gap-2 text-sm font-semibold text-cv-ink"><Icon Svg={step.Icon} size={15} />{step.tag}</p>
              </div>
            </Reveal>
          </li>
        ))}
      </ol>
    </Section>
  );
}
