import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BellRing, CalendarClock, CreditCard, Gift, Globe, Smartphone, Users } from "lucide-react";
import { PageShell, PageHero, SectionHead, CtaBand } from "@/components/marketing/PageShell";
import { BookingMock, ReminderCard, StatusCard, TodayMock } from "@/components/marketing/Mockups";
import { FOR_PAGES } from "@/lib/forPages";

export const metadata: Metadata = {
  title: "About Calvy · Free Website and Booking Page for Service Businesses",
  description: "Calvy helps clinics, salons, lawyers, fitness studios and consultants build a free website and online booking page, with time slots, tokens, reminders and online payments.",
  alternates: { canonical: "/about" },
};

const WHAT_YOU_GET = [
  { Icon: Globe, title: "A free website and booking page", body: "With the wording of your own kind of business: patients and doctors for a clinic, clients and stylists for a salon." },
  { Icon: CalendarClock, title: "Time slots, tokens, or both", body: "Customers pick a time, or take a number and watch their place in the queue." },
  { Icon: BellRing, title: "Reminders that go out on their own", body: "Email on every plan, WhatsApp on paid plans, and push alerts on your phone." },
  { Icon: Users, title: "Your team, with roles", body: "Team logins, reviews, follow-ups and a business app you can install on your phone." },
  { Icon: CreditCard, title: "Payments into your own account", body: "On a paid plan, connect your own payment gateway. Calvy never holds your money." },
  { Icon: Gift, title: "Rewards for loyal customers", body: "Customers who keep coming back earn rewards, and there is more on the way." },
];

const sample = FOR_PAGES[0].sample;

export default function AboutPage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="About Calvy"
        title="Bookings for small service businesses, made simple"
        intro="Calvy gives small service businesses a website and an online booking page they can set up in minutes, without a developer."
        visual={
          <>
            <BookingMock sample={sample} serviceLabel="service" personLabel="doctor" />
            <div className="absolute -bottom-6 -left-6 lg:-left-14 hidden sm:block"><ReminderCard appointmentWord="appointment" /></div>
            <div className="absolute -top-5 -right-4 lg:-right-10 hidden sm:block"><StatusCard queue appointmentWord="appointment" /></div>
          </>
        }
      >
        <div className="mt-9 flex flex-wrap gap-3">
          <Link href="/signup" className="group inline-flex items-center justify-center gap-2 min-h-12 px-7 rounded-2xl bg-sky-600 hover:bg-sky-700 text-white font-semibold shadow-lg shadow-sky-600/25 transition-colors">Start free <ArrowRight size={17} className="group-hover:translate-x-1 transition-transform" /></Link>
          <Link href="/contact" className="inline-flex items-center justify-center min-h-12 px-7 rounded-2xl border border-gray-300 hover:bg-gray-50 text-gray-900 font-semibold transition-colors">Talk to us</Link>
        </div>
      </PageHero>

      <section className="py-16 sm:py-24 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-sky-600">What we do</p>
            <h2 className="mt-3 font-syne font-extrabold text-3xl sm:text-4xl text-gray-900 text-balance">Putting the phone-and-WhatsApp diary online</h2>
            <p className="mt-5 text-gray-600 text-lg leading-relaxed">Clinics, salons, law practices, fitness studios and solo consultants still take many bookings by phone and WhatsApp. Calvy puts that online: a website with your services, team and hours, and a booking page where customers pick a time slot or take a token, any time of day.</p>
          </div>
          <div className="rounded-3xl bg-gradient-to-br from-sky-100 via-white to-indigo-100 p-8 sm:p-10"><TodayMock sample={sample} clientWord="patient" /></div>
        </div>
      </section>

      <section className="py-16 sm:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHead eyebrow="What you get" title="Everything in one place" />
          <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {WHAT_YOU_GET.map(({ Icon, title, body }) => (
              <div key={title} className="rounded-2xl border border-gray-100 bg-white p-7 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all">
                <span className="w-11 h-11 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center"><Icon size={21} aria-hidden /></span>
                <h3 className="mt-5 font-syne font-bold text-lg text-gray-900">{title}</h3>
                <p className="mt-2 text-gray-600 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-20 bg-gray-50 border-y border-gray-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 grid md:grid-cols-2 gap-10 items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-sky-600">How we work</p>
            <h2 className="mt-3 font-syne font-extrabold text-3xl text-gray-900 text-balance">Simple plans, real people</h2>
            <p className="mt-4 text-gray-600 leading-relaxed">The free plan has no monthly fee. Paid plans add more staff, WhatsApp messages and extra tools, and you can see current prices on the <Link href="/pricing" className="text-sky-700 underline">pricing page</Link>. We read and answer every message sent to our <Link href="/contact" className="text-sky-700 underline">contact address</Link>.</p>
          </div>
          <div className="rounded-2xl bg-white border border-gray-100 p-6 shadow-sm">
            <p className="flex items-center gap-2 text-sm font-semibold text-gray-900"><Smartphone size={16} className="text-sky-600" aria-hidden /> Built for</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {FOR_PAGES.map((p) => (
                <Link key={p.slug} href={`/for/${p.slug}`} className="inline-flex items-center gap-1.5 min-h-10 px-4 rounded-full border border-gray-200 hover:border-sky-300 hover:text-sky-700 text-sm font-semibold text-gray-800 transition-colors">
                  {p.what.charAt(0).toUpperCase() + p.what.slice(1)} <ArrowRight size={13} aria-hidden />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <CtaBand title="Ready to take bookings online?" text="Start free and have your website and booking link ready in minutes." />
    </PageShell>
  );
}
