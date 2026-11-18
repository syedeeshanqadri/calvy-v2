"use client";
import { Check, Video, Bell, CreditCard } from "lucide-react";
import { useRegion } from "./useRegion";
import { Section, Heading, Icon } from "@/components/marketing/ui";
import { Reveal } from "@/components/marketing/Reveal";
import { BASE, PAYMENTS, RECEIPTS } from "@/lib/landingFeatures";

// The same features, grouped into four themes. Tiles differ in size; the first tile of each theme carries a small coded UI card.
// (The token queue feature has its own spotlight section above, so it is not repeated here.)
const THEMES: { title: string; titles: string[] }[] = [
  { title: "Bookings", titles: ["Online consultations", "Follow-ups", "Group and multi-service bookings"] },
  { title: "Reminders and alerts", titles: ["Email, WhatsApp and push alerts", "A business app on your phone"] },
  { title: "Payments and growth", titles: ["Online payments", "Receipts", "Rewards", "Reviews", "Client database and broadcasts", "Analytics, exports and expenses"] },
  { title: "Your team and brand", titles: ["A free website, built for you", "Team roles", "Your brand and search listing", "A customer account"] },
];

// Column spans on a 6-column grid, by tile count, so tiles differ in size and every row fills.
const SPAN_SETS: Record<number, number[]> = { 1: [6], 2: [4, 2], 3: [3, 3, 6], 4: [4, 2, 3, 3], 5: [3, 3, 2, 2, 2], 6: [3, 3, 2, 2, 2, 6] };
const SPAN_CLASS: Record<number, string> = { 2: "lg:col-span-2", 3: "lg:col-span-3", 4: "lg:col-span-4", 6: "lg:col-span-6" };

const mini = "mt-5 rounded-mk-card border border-[rgba(15,23,42,0.06)] bg-cv-paper p-3.5";

/** A small piece of product UI for the first tile of a theme. Decorative. */
function MiniCard({ theme }: { theme: string }) {
  if (theme === "Bookings") {
    return <div className={`${mini} flex items-center gap-3`} aria-hidden><span className="grid h-9 w-9 place-items-center rounded-xl bg-cv-blue text-white"><Video size={17} /></span><div><p className="m-0 text-sm font-semibold text-cv-ink">Video consultation</p><p className="m-0 text-xs text-cv-mute">Tuesday 11:00 AM · joining link sent</p></div></div>;
  }
  if (theme === "Reminders and alerts") {
    return <div className={`${mini}`} aria-hidden><div className="mb-2 flex items-center gap-2 text-xs font-semibold text-cv-ink"><Bell size={14} className="text-cv-blue" /> Reminder · 9:00 AM</div><p className="m-0 w-fit max-w-full rounded-[14px] rounded-tl-[4px] bg-cv-blue-tint px-3 py-2 text-sm text-cv-ink">Your appointment is tomorrow at 10:30 AM. See you then.</p></div>;
  }
  if (theme === "Payments and growth") {
    return <div className={`${mini} flex items-center gap-3`} aria-hidden><span className="grid h-9 w-9 place-items-center rounded-xl bg-cv-blue text-white"><CreditCard size={17} /></span><div className="min-w-0 flex-1"><p className="m-0 text-sm font-semibold text-cv-ink">Paid online</p><p className="m-0 text-xs text-cv-mute">Straight to your own account</p></div><span className="rounded-full bg-cv-blue-tint px-2.5 py-1 text-[11px] font-semibold text-cv-blue">Settled</span></div>;
  }
  return <div className={`${mini}`} aria-hidden><div className="mb-2 flex gap-1.5"><span className="h-2 w-2 rounded-full bg-cv-line" /><span className="h-2 w-2 rounded-full bg-cv-line" /><span className="h-2 w-2 rounded-full bg-cv-line" /></div><div className="h-2.5 w-2/3 rounded bg-cv-line" /><div className="mt-2 h-2 w-full rounded bg-cv-line/70" /><div className="mt-3 flex gap-2"><span className="h-7 w-24 rounded-lg bg-cv-blue" /><span className="h-7 w-20 rounded-lg border border-cv-line" /></div></div>;
}

export function Features() {
  const region = useRegion();
  const extra = RECEIPTS[region];
  const features = [...BASE.slice(0, 7), PAYMENTS[region], ...BASE.slice(7), ...(extra ? [extra] : [])];
  const byTitle = new Map(features.map((f) => [f.title, f]));
  return (
    <Section id="features" tone="paper">
      <Reveal>
        <Heading
          title="Everything you need to take bookings online"
          intro="Build your website and booking page for free. These are real features you can use today, and each card says which plan has it."
        />
      </Reveal>
      <div className="flex flex-col gap-16">
        {THEMES.map((theme) => {
          const present = theme.titles.filter((t) => byTitle.has(t));
          const spans = SPAN_SETS[present.length] ?? [];
          return (
            <Reveal key={theme.title}>
              <h3 className="mb-6 border-b border-black/[0.08] pb-3 font-display text-xl font-bold text-cv-ink">{theme.title}</h3>
              <div className="grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-6">
                {present.map((t, i) => {
                  const f = byTitle.get(t)!;
                  return (
                    <div key={t} className={`mk-lift flex flex-col rounded-mk-card border border-black/[0.07] bg-white p-6 ${SPAN_CLASS[spans[i] ?? 2]} ${(spans[i] ?? 2) >= 3 ? "sm:col-span-2" : ""}`}>
                      <Icon Svg={f.Icon} size={22} />
                      <h4 className="mt-4 mb-2 font-display text-lg font-bold text-cv-ink">{f.title}</h4>
                      <p className="m-0 flex-1 text-sm leading-relaxed text-cv-mute">{f.desc}</p>
                      <p className="mt-4 mb-0 flex items-center gap-1.5 text-xs font-semibold text-cv-ink"><Check size={13} className="text-cv-blue" strokeWidth={3} aria-hidden />{f.plan}</p>
                      {i === 0 && <MiniCard theme={theme.title} />}
                    </div>
                  );
                })}
              </div>
            </Reveal>
          );
        })}
      </div>
    </Section>
  );
}
