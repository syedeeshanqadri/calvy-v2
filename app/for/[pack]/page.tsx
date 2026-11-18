import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, BellRing, CalendarClock, Check, CreditCard, Globe, Smartphone, Users, Video, type LucideIcon } from "lucide-react";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import { SITE_URL } from "@/lib/site";
import { jsonLdString } from "@/lib/jsonLd";
import { FOR_PAGES, forPageBySlug, forPageCopy } from "@/lib/forPages";
import { getPack } from "@/lib/packs";
import { BookingMock, ReminderCard, StatusCard, TodayMock } from "@/components/marketing/Mockups";

const POINT_ICONS: LucideIcon[] = [CalendarClock, Video, BellRing, CreditCard, Users, Smartphone, Globe];

export const dynamicParams = false;
export const generateStaticParams = () => FOR_PAGES.map((p) => ({ pack: p.slug }));

export async function generateMetadata(props: { params: Promise<{ pack: string }> }): Promise<Metadata> {
  const page = forPageBySlug((await props.params).pack);
  if (!page) return {};
  const c = forPageCopy(page);
  return {
    title: { absolute: c.title },
    description: c.description,
    alternates: { canonical: `/for/${page.slug}` },
    openGraph: { title: c.title, description: c.description, url: `/for/${page.slug}`, siteName: "Calvy", type: "website" },
  };
}

export default async function ForPackPage(props: { params: Promise<{ pack: string }> }) {
  const page = forPageBySlug((await props.params).pack);
  if (!page) notFound();
  const c = forPageCopy(page);
  const url = `${SITE_URL}/for/${page.slug}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebPage", "@id": `${url}#page`, url, name: c.title, description: c.description, isPartOf: { "@id": `${SITE_URL}/#website` } },
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Calvy", item: SITE_URL },
        { "@type": "ListItem", position: 2, name: `For ${page.what}`, item: url },
      ] },
    ],
  };
  const terms = getPack(page.pack).terms;
  const client = terms.client.plural;
  const appt = terms.appointment.singular;
  const person = terms.staff.singular;
  const service = terms.service.singular;
  const others = FOR_PAGES.filter((p) => p.slug !== page.slug);
  const steps = [
    { n: "1", title: "Sign up and pick your type", body: `Choose ${terms.business.singular} and Calvy sets up the right words, from ${terms.client.plural} to ${terms.appointment.plural}.` },
    { n: "2", title: `Add your ${terms.service.plural} and hours`, body: `List what you offer, who does it and when you are open. Your website and booking link are ready straight away.` },
    { n: "3", title: `Share the link, get ${terms.appointment.plural}`, body: `Your ${client} book any time of day. You get an alert, and reminders go out on their own.` },
  ];
  return (
    <main className="bg-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />
      <Navbar />

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-sky-50 via-white to-white pt-28 sm:pt-32 pb-16 sm:pb-24">
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          <div className="absolute -top-40 -left-32 w-[640px] h-[640px] rounded-full bg-sky-300/30 blur-3xl" />
          <div className="absolute -bottom-40 right-0 w-[560px] h-[560px] rounded-full bg-indigo-200/40 blur-3xl" />
          <div className="absolute inset-0 opacity-[0.5]" style={{ backgroundImage: "radial-gradient(#dbe4ee 1px, transparent 1px)", backgroundSize: "30px 30px" }} />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-2 gap-14 lg:gap-10 items-center">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-sky-700">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-500" /> For {page.what}
            </span>
            <h1 className="mt-6 font-syne font-extrabold text-4xl sm:text-5xl lg:text-[3.4rem] leading-[1.05] tracking-tight text-gray-900 text-balance">{c.h1}</h1>
            <p className="mt-6 text-lg text-gray-600 leading-relaxed max-w-xl">{c.intro}</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/signup" className="group inline-flex items-center justify-center gap-2 min-h-12 px-7 rounded-2xl bg-sky-600 hover:bg-sky-700 text-white font-semibold shadow-lg shadow-sky-600/25 transition-colors">
                Start free <ArrowRight size={17} className="group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link href="/pricing" className="inline-flex items-center justify-center min-h-12 px-7 rounded-2xl border border-gray-300 hover:bg-gray-50 text-gray-900 font-semibold transition-colors">See pricing</Link>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-500">
              {["Free plan, no credit card", "Ready in minutes", "Your own words, not generic software"].map((t) => (
                <li key={t} className="flex items-center gap-1.5"><Check size={15} className="text-sky-600" aria-hidden /> {t}</li>
              ))}
            </ul>
          </div>
          <div className="relative mx-auto w-full max-w-md lg:max-w-none lg:pl-6 pb-16 sm:pb-10">
            <div className="max-w-md mx-auto lg:ml-auto"><BookingMock sample={page.sample} serviceLabel={service} personLabel={person} /></div>
            <div className="absolute -bottom-2 left-0 sm:-left-4 lg:left-0 hidden sm:block"><ReminderCard appointmentWord={appt} /></div>
            <div className="absolute -top-4 right-0 sm:-right-2 hidden sm:block"><StatusCard queue={page.sample.queue} appointmentWord={appt} /></div>
          </div>
        </div>
      </section>

      {/* In your words */}
      <section className="py-14 sm:py-16 bg-white border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-sky-600">Built in your words</p>
          <h2 className="mt-3 font-syne font-extrabold text-2xl sm:text-3xl text-gray-900 text-balance">Calvy talks like your {terms.business.singular}, not like generic software</h2>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {[["Customers", terms.client.plural], ["Bookings", terms.appointment.plural], ["Team", terms.staff.plural], ["Offers", terms.service.plural]].map(([k, v]) => (
              <div key={k} className="rounded-2xl border border-gray-200 bg-gray-50 px-5 py-3 text-left">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{k}</p>
                <p className="font-syne font-bold text-lg text-gray-900 capitalize">{v}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 sm:py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-widest text-sky-600">What you get</p>
            <h2 className="mt-3 font-syne font-extrabold text-3xl sm:text-4xl text-gray-900 text-balance">Everything a busy {terms.business.singular} needs to take bookings online</h2>
          </div>
          <div className="mt-12 grid lg:grid-cols-5 gap-8 items-start">
            <div className="lg:col-span-3 grid sm:grid-cols-2 gap-4">
              {page.points.map((pt, i) => {
                const Icon = POINT_ICONS[i % POINT_ICONS.length];
                return (
                  <div key={pt} className={`rounded-2xl bg-white border border-gray-100 p-6 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all ${i === 0 ? "sm:col-span-2" : ""}`}>
                    <span className="w-11 h-11 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center"><Icon size={21} aria-hidden /></span>
                    <p className="mt-4 text-gray-800 leading-relaxed">{pt}</p>
                  </div>
                );
              })}
            </div>
            <div className="lg:col-span-2 lg:sticky lg:top-28">
              <div className="rounded-3xl bg-gradient-to-br from-sky-100 via-white to-indigo-100 p-8 sm:p-10">
                <TodayMock sample={page.sample} clientWord={terms.client.singular} />
                <p className="mt-6 text-center text-sm text-gray-600">Run the day from your phone: see who is here, and call the next one.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16 sm:py-24 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto">
            <p className="text-xs font-bold uppercase tracking-widest text-sky-600">How it works</p>
            <h2 className="mt-3 font-syne font-extrabold text-3xl sm:text-4xl text-gray-900 text-balance">Live in three steps</h2>
          </div>
          <ol className="mt-12 grid md:grid-cols-3 gap-6">
            {steps.map((s) => (
              <li key={s.n} className="relative rounded-2xl border border-gray-100 bg-gradient-to-b from-white to-gray-50 p-7">
                <span className="font-syne font-extrabold text-5xl text-sky-100 absolute top-4 right-6" aria-hidden>{s.n}</span>
                <h3 className="relative font-syne font-bold text-lg text-gray-900">{s.title}</h3>
                <p className="relative mt-2 text-gray-600 leading-relaxed">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Other business types */}
      <section className="py-14 bg-gray-50 border-y border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-sm font-semibold text-gray-500">Calvy also works for</p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            {others.map((o) => (
              <Link key={o.slug} href={`/for/${o.slug}`} className="inline-flex items-center gap-2 min-h-11 px-5 rounded-full bg-white border border-gray-200 hover:border-sky-300 hover:text-sky-700 text-gray-800 font-semibold text-sm transition-colors">
                {o.what.charAt(0).toUpperCase() + o.what.slice(1)} <ArrowRight size={14} aria-hidden />
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative overflow-hidden bg-[#0b1220] py-16 sm:py-20">
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[640px] h-[320px] rounded-full bg-sky-500/20 blur-3xl" aria-hidden />
        <div className="relative max-w-3xl mx-auto px-4 text-center">
          <h2 className="font-syne font-extrabold text-3xl sm:text-4xl text-white text-balance">Put your {terms.business.singular} online today</h2>
          <p className="mt-4 text-slate-300 text-lg">Start free, share your booking link, and let your {client} book any time of day.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/signup" className="inline-flex items-center justify-center min-h-12 px-8 rounded-2xl bg-sky-500 hover:bg-sky-400 text-white font-semibold transition-colors">Start free</Link>
            <Link href="/pricing" className="inline-flex items-center justify-center min-h-12 px-8 rounded-2xl border border-white/20 hover:bg-white/10 text-white font-semibold transition-colors">See pricing</Link>
          </div>
          <p className="mt-6 text-sm text-slate-400">Plans, limits and prices are on the <Link href="/pricing" className="underline">pricing page</Link>.</p>
        </div>
      </section>
      <Footer />
    </main>
  );
}
