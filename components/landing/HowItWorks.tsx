import { Zap, Link2, TrendingUp } from "lucide-react";

const STEPS = [
  { num: "01", title: "Set up your profile", desc: "Add your services, pricing, team, and working hours. Takes under 10 minutes. No technical skills needed.", tag: "10 min setup", Icon: Zap },
  { num: "02", title: "Share your booking link", desc: "Send your unique link via Instagram, WhatsApp, email signature, or embed it on your website.", tag: "1-click sharing", Icon: Link2 },
  { num: "03", title: "Get booked & paid", desc: "Clients self-book 24/7. Reminders go out automatically. Payments collected upfront. You just show up.", tag: "24/7 bookings", Icon: TrendingUp },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-16 sm:py-20 lg:py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12 lg:mb-16">
          <span className="inline-block bg-sky-100 text-sky-700 text-xs font-bold tracking-widest uppercase px-4 py-2 rounded-full mb-4">How it works</span>
          <h2 className="font-syne font-extrabold text-3xl sm:text-4xl lg:text-5xl tracking-tight text-gray-900 mb-4">Up and running in 3 steps</h2>
          <p className="text-gray-500 text-lg max-w-md mx-auto">No setup fees. No training required. No IT department needed.</p>
        </div>
        <div className="grid lg:grid-cols-3 gap-8 relative">
          {/* Connector line */}
          <div className="hidden lg:block absolute top-14 left-[calc(33%+2rem)] right-[calc(33%+2rem)] h-px border-t-2 border-dashed border-sky-200" />
          {STEPS.map((step) => (
            <div key={step.num} className="relative bg-gray-50 rounded-3xl p-8 border border-gray-100 hover:border-sky-200 hover:shadow-lg transition-all duration-300">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-600 to-sky-500 flex items-center justify-center font-syne font-bold text-xl text-white mb-6 shadow-lg shadow-sky-200">
                {step.num}
              </div>
              <h3 className="font-syne font-bold text-xl text-gray-900 mb-3">{step.title}</h3>
              <p className="text-gray-500 leading-relaxed mb-5">{step.desc}</p>
              <div className="inline-flex items-center gap-2 bg-sky-50 text-sky-700 text-sm font-semibold px-4 py-2 rounded-full">
                <step.Icon size={14} />
                {step.tag}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
