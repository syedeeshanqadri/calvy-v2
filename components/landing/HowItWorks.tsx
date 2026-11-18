import { Zap, Link2, TrendingUp, ChevronRight } from "lucide-react";
import { Section, Heading, Icon, Phone } from "@/components/marketing/ui";

const STEPS = [
  { num: "01", title: "Set up your profile", desc: "Add your services, pricing, team, and working hours. Takes under 10 minutes. No technical skills needed.", tag: "10 min setup", Icon: Zap, shot: "services", alt: "Calvy Services screen with prices and durations" },
  { num: "02", title: "Share your booking link", desc: "Send your unique link via Instagram, WhatsApp, email signature, or embed it on your website.", tag: "1-click sharing", Icon: Link2, shot: "share", alt: "Calvy Booking Page screen with the copy-link button" },
  { num: "03", title: "Get booked & paid", desc: "Clients self-book 24/7. Reminders go out automatically. Payments collected upfront. You just show up.", tag: "24/7 bookings", Icon: TrendingUp, shot: "today", alt: "Calvy Today screen with the day's bookings" },
];

export function HowItWorks() {
  return (
    <Section id="how-it-works" tone="paper">
      <Heading title="Up and running in 3 steps" intro="No setup fees. No training required. No IT department needed." />
      <ol className="m-0 grid list-none gap-6 p-0 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-start">
        {STEPS.flatMap((step, i) => {
          const el = (
            <li key={step.num} className="min-w-0">
              <div className="mx-auto mb-5 max-w-[150px]"><Phone name={step.shot} alt={step.alt} crop className="max-w-[150px]" /></div>
              <p className="m-0 font-display text-sm font-bold text-cv-blue">{step.num}</p>
              <h3 className="mt-1 mb-2 font-display font-bold text-xl text-cv-ink">{step.title}</h3>
              <p className="m-0 mb-3 text-cv-mute leading-relaxed">{step.desc}</p>
              <p className="m-0 inline-flex items-center gap-2 text-sm font-semibold text-cv-ink"><Icon Svg={step.Icon} size={15} />{step.tag}</p>
            </li>
          );
          return i < STEPS.length - 1 ? [el, <li key={`a${i}`} aria-hidden className="hidden md:flex items-center self-center pt-10 text-cv-line"><ChevronRight size={28} /></li>] : [el];
        })}
      </ol>
    </Section>
  );
}
