import { Calendar, Bell, CreditCard, Users, BarChart2, Globe } from "lucide-react";

const FEATURES = [
  {
    Icon: Calendar,
    title: "Smart Booking Page",
    desc: "A beautiful, branded booking page your clients love. Customizable services, durations, and availability — ready in minutes.",
    bg: "bg-sky-50",
    icon_cls: "text-sky-600",
  },
  {
    Icon: Bell,
    title: "Automated Reminders",
    desc: "Cut no-shows by up to 80% with automatic SMS and email reminders sent before every appointment.",
    bg: "bg-green-50",
    icon_cls: "text-green-600",
  },
  {
    Icon: CreditCard,
    title: "Integrated Payments",
    desc: "Collect deposits or full payments at booking. Stripe-powered, secure, and instant payouts to your bank.",
    bg: "bg-blue-50",
    icon_cls: "text-blue-600",
  },
  {
    Icon: Globe,
    title: "Full Business Website",
    desc: "Every signup gets a complete, professional website — hero, services, team, and contact info — auto-generated and editable.",
    bg: "bg-purple-50",
    icon_cls: "text-purple-600",
  },
  {
    Icon: Users,
    title: "Team Management",
    desc: "Manage multiple staff members, their schedules, and services. Clients can pick their preferred provider.",
    bg: "bg-rose-50",
    icon_cls: "text-rose-500",
  },
  {
    Icon: BarChart2,
    title: "Analytics Dashboard",
    desc: "Know your busiest hours, top clients, and revenue trends at a glance. Make smarter business decisions.",
    bg: "bg-amber-50",
    icon_cls: "text-amber-600",
  },
];

export function Features() {
  return (
    <section id="features" className="py-16 sm:py-20 lg:py-24 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12 lg:mb-16">
          <span className="inline-block bg-sky-100 text-sky-700 text-xs font-bold tracking-widest uppercase px-4 py-2 rounded-full mb-4">Features</span>
          <h2 className="font-syne font-extrabold text-3xl sm:text-4xl lg:text-5xl tracking-tight text-gray-900 mb-4">
            Everything you need,<br />nothing you don&apos;t
          </h2>
          <p className="text-gray-500 text-lg max-w-xl mx-auto leading-relaxed">
            Built specifically for service businesses that need reliable, beautiful booking — not enterprise bloat.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="group bg-white p-8 rounded-2xl border border-gray-100 hover:border-sky-200 hover:-translate-y-1 hover:shadow-lg transition-all duration-300 cursor-default"
            >
              <div className={`w-12 h-12 rounded-2xl ${f.bg} flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-300`}>
                <f.Icon size={22} className={f.icon_cls} />
              </div>
              <h3 className="font-syne font-bold text-base text-gray-900 mb-2">{f.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
