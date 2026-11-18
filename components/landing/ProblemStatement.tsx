import { Phone, BookOpen, AlertTriangle, CreditCard, Globe } from "lucide-react";
import { Heading, WRAP } from "@/components/marketing/ui";
import { Chat } from "@/components/marketing/BeforeAfter";
import { CalvyCards } from "@/components/marketing/CalvyCards";
import { Reveal } from "@/components/marketing/Reveal";

const PAINS = [
  { Icon: Phone, headline: "You're always on your phone", body: "Taking bookings manually via WhatsApp and calls eats hours you should be spending with clients." },
  { Icon: AlertTriangle, headline: "Clients forget and don't show up", body: "No-shows cost you time and money. Without automatic reminders, you're chasing people every day." },
  { Icon: CreditCard, headline: "Chasing payment is awkward", body: "Asking for payment after a session is uncomfortable and slow. Half the time it never comes." },
  { Icon: BookOpen, headline: "Paper diaries and spreadsheets break down", body: "Double bookings, lost records, no overview of your week — the old way doesn't scale." },
  { Icon: Globe, headline: "You have no online presence", body: "Clients can't find you, can't book you, and go to a competitor who makes it easy." },
];

/** A full-width deep-blue band: the old way (a chat thread over a paper diary) against composed Calvy cards, then the pains. */
export function ProblemStatement() {
  return (
    <section id="problem" className="mk border-t border-black/[0.06] bg-cv-blue py-20 text-white sm:py-24 lg:py-28">
      <div className={WRAP}>
        <Reveal>
          <Heading tone="dark" title={<>Running a service business is hard. It doesn&apos;t have to be.</>} intro="Most service businesses lose hours every week to admin that should be automatic." />
        </Reveal>
        <Reveal delay={0.08}>
          <div className="grid items-start gap-14 md:grid-cols-2 lg:gap-20">
            <figure className="m-0 min-w-0">
              <figcaption className="mb-5 text-sm font-semibold text-white/80">Before</figcaption>
              <Chat />
            </figure>
            <figure className="m-0 min-w-0">
              <figcaption className="mb-5 text-sm font-semibold text-white/80">With Calvy</figcaption>
              <CalvyCards />
            </figure>
          </div>
        </Reveal>
        <ul className="m-0 mt-16 grid list-none gap-x-10 gap-y-8 border-t border-white/15 p-0 pt-10 sm:grid-cols-2 lg:grid-cols-3">
          {PAINS.map(({ Icon, headline, body }) => (
            <li key={headline}>
              <Icon size={20} className="text-white/90" strokeWidth={1.75} aria-hidden />
              <h3 className="mt-3 mb-1.5 font-display text-lg font-bold text-white">{headline}</h3>
              <p className="m-0 text-sm leading-relaxed text-white/75">{body}</p>
            </li>
          ))}
        </ul>
        <p className="mt-12 mb-0 max-w-2xl border-l-4 border-cv-marigold pl-4 text-lg font-medium text-white">Calvy fixes all of this — booking page, reminders, and payments — in 60 seconds.</p>
      </div>
    </section>
  );
}
