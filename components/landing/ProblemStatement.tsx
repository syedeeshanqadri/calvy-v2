import { Phone, BookOpen, AlertTriangle, CreditCard, Globe } from "lucide-react";

const PAINS = [
  {
    Icon: Phone,
    headline: "You're always on your phone",
    body: "Taking bookings manually via WhatsApp and calls eats hours you should be spending with clients.",
  },
  {
    Icon: AlertTriangle,
    headline: "Clients forget and don't show up",
    body: "No-shows cost you time and money. Without automatic reminders, you're chasing people every day.",
  },
  {
    Icon: CreditCard,
    headline: "Chasing payment is awkward",
    body: "Asking for payment after a session is uncomfortable and slow. Half the time it never comes.",
  },
  {
    Icon: BookOpen,
    headline: "Paper diaries and spreadsheets break down",
    body: "Double bookings, lost records, no overview of your week — the old way doesn't scale.",
  },
  {
    Icon: Globe,
    headline: "You have no online presence",
    body: "Clients can't find you, can't book you, and go to a competitor who makes it easy.",
  },
];

export function ProblemStatement() {
  return (
    <section className="pt-8 sm:pt-10 pb-16 sm:pb-20 lg:pb-24 bg-gray-950 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12 lg:mb-16">
          <span className="inline-block bg-white/10 text-white/60 text-xs font-bold tracking-widest uppercase px-4 py-2 rounded-full mb-4 border border-white/10">
            Sound familiar?
          </span>
          <h2 className="font-syne font-extrabold text-3xl sm:text-4xl lg:text-5xl tracking-tight text-white mb-4">
            Running a service business is hard.
            <br />
            <span className="text-sky-400">It doesn&apos;t have to be.</span>
          </h2>
          <p className="text-gray-400 text-lg max-w-xl mx-auto">
            Most service businesses lose hours every week to admin that should be automatic.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-12">
          {PAINS.slice(0, 3).map(({ Icon, headline, body }) => (
            <PainCard key={headline} Icon={Icon} headline={headline} body={body} />
          ))}
        </div>
        <div className="grid sm:grid-cols-2 gap-5 max-w-2xl mx-auto lg:max-w-none lg:grid-cols-2 lg:mx-0 lg:max-w-2xl lg:mx-auto">
          {PAINS.slice(3).map(({ Icon, headline, body }) => (
            <PainCard key={headline} Icon={Icon} headline={headline} body={body} />
          ))}
        </div>

        {/* Bridge to solution */}
        <div className="mt-14 text-center">
          <div className="inline-flex items-center gap-3 bg-sky-600/10 border border-sky-500/20 rounded-2xl px-6 py-4">
            <div className="w-2 h-2 rounded-full bg-sky-400 animate-pulse flex-shrink-0" />
            <p className="text-sky-300 font-medium text-sm">
              Calvy fixes all of this — booking page, reminders, and payments — in 60 seconds.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function PainCard({ Icon, headline, body }: { Icon: React.ElementType; headline: string; body: string }) {
  return (
    <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-6 hover:bg-white/[0.07] transition-colors duration-300">
      <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-4">
        <Icon size={18} className="text-red-400" />
      </div>
      <h3 className="font-syne font-bold text-white text-base mb-2">{headline}</h3>
      <p className="text-gray-400 text-sm leading-relaxed">{body}</p>
    </div>
  );
}
