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
import { Browser, Heading, Icon, Phone, PrimaryLink, OutlineLink, Section, WRAP, card } from "@/components/marketing/ui";
import { CtaBand } from "@/components/marketing/PageShell";

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
  const others = FOR_PAGES.filter((p) => p.slug !== page.slug);
  const steps = [
    { n: "1", title: "Sign up and pick your type", body: `Choose ${terms.business.singular} and Calvy sets up the right words, from ${terms.client.plural} to ${terms.appointment.plural}.` },
    { n: "2", title: `Add your ${terms.service.plural} and hours`, body: `List what you offer, who does it and when you are open. Your website and booking link are ready straight away.` },
    { n: "3", title: `Share the link, get ${terms.appointment.plural}`, body: `Your ${client} book any time of day. You get an alert, and reminders go out on their own.` },
  ];
  // Clinics run on tokens, so they see the live queue; everyone else sees the booking page.
  const heroShot = page.sample.queue ? { name: "queue", alt: "The live token queue on a phone" } : { name: "booking", alt: "A booking page on a phone: choose a service and a time" };
  return (
    <main className="bg-cv-paper">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />
      <Navbar />

      <section className="bg-cv-paper pt-28 sm:pt-32 pb-16 sm:pb-24">
        <div className={`${WRAP} grid items-center gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16`}>
          <div className="min-w-0">
            <h1 className="font-display font-bold text-4xl sm:text-5xl lg:text-[3.4rem] leading-[1.05] tracking-tight text-cv-ink text-balance">{c.h1}</h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-cv-mute">{c.intro}</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <PrimaryLink href="/signup">Start free</PrimaryLink>
              <OutlineLink href="/pricing">See pricing</OutlineLink>
            </div>
            <ul className="mt-8 flex list-none flex-wrap gap-x-6 gap-y-2 p-0 text-sm text-cv-mute">
              {["Free plan, no credit card", "Ready in minutes", "Your own words, not generic software"].map((t) => (
                <li key={t} className="flex items-center gap-1.5"><Check size={15} className="text-cv-blue" aria-hidden /> {t}</li>
              ))}
            </ul>
          </div>
          <div className="min-w-0"><Phone name={heroShot.name} alt={heroShot.alt} priority className="max-w-[280px]" /></div>
        </div>
      </section>

      <Section tone="card">
        <Heading title={`Calvy talks like your ${terms.business.singular}, not like generic software`} />
        <div className="flex flex-wrap gap-3">
          {[["Customers", terms.client.plural], ["Bookings", terms.appointment.plural], ["Team", terms.staff.plural], ["Offers", terms.service.plural]].map(([k, v]) => (
            <div key={k} className={`${card} px-5 py-3`}>
              <p className="m-0 text-[11px] font-bold uppercase tracking-widest text-cv-mute">{k}</p>
              <p className="m-0 font-display font-bold text-lg capitalize text-cv-ink">{v}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section tone="paper">
        <Heading title={`Everything a busy ${terms.business.singular} needs to take bookings online`} />
        <div className="grid items-start gap-10 lg:grid-cols-5">
          <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 lg:col-span-3">
            {page.points.map((pt, i) => {
              const Svg = POINT_ICONS[i % POINT_ICONS.length];
              return (
                <li key={pt} className={`${card} p-6 ${i === 0 ? "sm:col-span-2" : ""}`}>
                  <Icon Svg={Svg} />
                  <p className="mt-4 mb-0 leading-relaxed text-cv-ink">{pt}</p>
                </li>
              );
            })}
          </ul>
          <div className="lg:col-span-2 lg:sticky lg:top-28">
            <Phone name="today" alt="The Today list: who is booked, who has arrived" crop className="max-w-[240px]" />
            <p className="mt-6 text-center text-sm text-cv-mute">Run the day from your phone: see who is here, and call the next one.</p>
          </div>
        </div>
      </Section>

      <Section tone="card">
        <Heading title="Live in three steps" />
        <ol className="m-0 grid list-none gap-8 p-0 md:grid-cols-3">
          {steps.map((s) => (
            <li key={s.n} className="border-t-2 border-cv-blue pt-5">
              <p className="m-0 font-display text-sm font-bold text-cv-blue">{s.n}</p>
              <h3 className="mt-1 mb-2 font-display font-bold text-lg text-cv-ink">{s.title}</h3>
              <p className="m-0 leading-relaxed text-cv-mute">{s.body}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section tone="paper" className="!py-12">
        <p className="m-0 mb-4 text-sm font-semibold text-cv-mute">Calvy also works for</p>
        <div className="flex flex-wrap gap-3">
          {others.map((o) => (
            <Link key={o.slug} href={`/for/${o.slug}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-cv-line bg-cv-card px-5 text-sm font-semibold text-cv-ink transition-colors hover:border-cv-blue hover:text-cv-blue">
              {o.what.charAt(0).toUpperCase() + o.what.slice(1)} <ArrowRight size={14} aria-hidden />
            </Link>
          ))}
        </div>
      </Section>

      <CtaBand title={`Put your ${terms.business.singular} online today`} text={`Start free, share your booking link, and let your ${client} book any time of day.`} />
      <p className="m-0 bg-cv-blue pb-10 text-center text-sm text-white/80">Plans, limits and prices are on the <Link href="/pricing" className="underline">pricing page</Link>.</p>
      <Footer />
    </main>
  );
}
