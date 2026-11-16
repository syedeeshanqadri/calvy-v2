import { Calendar, Bell, Globe, Users, Star, Smartphone, Repeat, CreditCard, type LucideIcon } from "lucide-react";

const FEATURES: { Icon: LucideIcon; title: string; desc: string; bg: string; cls: string }[] = [
  { Icon: Calendar, title: "Time slots and token queues", desc: "Let customers pick a time, or take a token and wait their turn, the way clinics and walk-in shops work. Both run from one booking link.", bg: "bg-sky-50", cls: "text-sky-600" },
  { Icon: Globe, title: "A free website, built for you", desc: "Every business gets a website with services, team, hours and a Book Now button. Edit the text, photos, colours and sections in the website builder.", bg: "bg-purple-50", cls: "text-purple-600" },
  { Icon: Bell, title: "Email, WhatsApp and push alerts", desc: "Confirmations and reminders by email, WhatsApp on paid plans, and instant push alerts on your phone when a booking comes in.", bg: "bg-green-50", cls: "text-green-600" },
  { Icon: Users, title: "Team roles", desc: "Add staff and receptionists with their own logins. Each person sees only what their role allows.", bg: "bg-rose-50", cls: "text-rose-500" },
  { Icon: Star, title: "Reviews", desc: "Show your Google reviews link on your website and ask happy customers to leave one.", bg: "bg-amber-50", cls: "text-amber-600" },
  { Icon: Repeat, title: "Follow-ups", desc: "Offer a follow-up visit after an appointment, and let customers book again in a tap.", bg: "bg-blue-50", cls: "text-blue-600" },
  { Icon: CreditCard, title: "Online payments", desc: "Take payment at booking through Cashfree. Money from cancelled bookings stays as credit your customer can use next time.", bg: "bg-emerald-50", cls: "text-emerald-600" },
  { Icon: Smartphone, title: "A business app on your phone", desc: "Install Calvy on your phone's home screen. See today's list, mark people arrived, and call the next token.", bg: "bg-indigo-50", cls: "text-indigo-600" },
];

export function Features() {
  return (
    <section id="features" className="py-16 sm:py-20 lg:py-24 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12 lg:mb-16">
          <span className="inline-block bg-sky-100 text-sky-700 text-xs font-bold tracking-widest uppercase px-4 py-2 rounded-full mb-4">Features</span>
          <h2 className="font-syne font-extrabold text-3xl sm:text-4xl lg:text-5xl tracking-tight text-gray-900 mb-4">
            Everything you need to take bookings online
          </h2>
          <p className="text-gray-600 text-lg max-w-xl mx-auto leading-relaxed">
            Build your website and booking page for free. These are real features you can use today.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-white p-7 rounded-2xl border border-gray-100">
              <div className={`w-12 h-12 rounded-2xl ${f.bg} flex items-center justify-center mb-5`}>
                <f.Icon size={22} className={f.cls} aria-hidden />
              </div>
              <h3 className="font-syne font-bold text-base text-gray-900 mb-2">{f.title}</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
