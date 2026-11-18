import { Phone, BookOpen, AlertTriangle, CreditCard, Globe } from "lucide-react";
import { Section, Heading, Icon } from "@/components/marketing/ui";
import { BeforeAfter } from "@/components/marketing/BeforeAfter";

const PAINS = [
  { Icon: Phone, headline: "You're always on your phone", body: "Taking bookings manually via WhatsApp and calls eats hours you should be spending with clients." },
  { Icon: AlertTriangle, headline: "Clients forget and don't show up", body: "No-shows cost you time and money. Without automatic reminders, you're chasing people every day." },
  { Icon: CreditCard, headline: "Chasing payment is awkward", body: "Asking for payment after a session is uncomfortable and slow. Half the time it never comes." },
  { Icon: BookOpen, headline: "Paper diaries and spreadsheets break down", body: "Double bookings, lost records, no overview of your week — the old way doesn't scale." },
  { Icon: Globe, headline: "You have no online presence", body: "Clients can't find you, can't book you, and go to a competitor who makes it easy." },
];

export function ProblemStatement() {
  return (
    <Section id="problem" tone="card">
      <Heading
        title={<>Running a service business is hard. It doesn&apos;t have to be.</>}
        intro="Most service businesses lose hours every week to admin that should be automatic."
      />
      <BeforeAfter />
      <ul className="mt-14 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 list-none p-0">
        {PAINS.map(({ Icon: Svg, headline, body }) => (
          <li key={headline} className="border-t border-cv-line pt-5">
            <Icon Svg={Svg} size={20} />
            <h3 className="mt-3 mb-1.5 font-display font-bold text-lg text-cv-ink">{headline}</h3>
            <p className="m-0 text-sm leading-relaxed text-cv-mute">{body}</p>
          </li>
        ))}
      </ul>
      <p className="mt-10 mb-0 border-l-4 border-cv-marigold pl-4 font-medium text-cv-ink">Calvy fixes all of this — booking page, reminders, and payments — in 60 seconds.</p>
    </Section>
  );
}
