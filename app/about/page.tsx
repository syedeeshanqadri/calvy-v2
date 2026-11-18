import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BellRing, CalendarClock, CreditCard, Gift, Globe, Users } from "lucide-react";
import { PageShell, PageHero, CtaBand } from "@/components/marketing/PageShell";
import { Browser, Heading, Icon, Phone, PrimaryLink, OutlineLink, Section, card } from "@/components/marketing/ui";
import { FOR_PAGES } from "@/lib/forPages";

export const metadata: Metadata = {
  title: "About Calvy · Free Website and Booking Page for Service Businesses",
  description: "Calvy helps clinics, salons, lawyers, fitness studios and consultants build a free website and online booking page, with time slots, tokens, reminders and online payments.",
  alternates: { canonical: "/about" },
};

const WHAT_YOU_GET = [
  { Svg: Globe, title: "A free website and booking page", body: "With the wording of your own kind of business: patients and doctors for a clinic, clients and stylists for a salon." },
  { Svg: CalendarClock, title: "Time slots, tokens, or both", body: "Customers pick a time, or take a number and watch their place in the queue." },
  { Svg: BellRing, title: "Reminders that go out on their own", body: "Email on every plan, WhatsApp on paid plans, and push alerts on your phone." },
  { Svg: Users, title: "Your team, with roles", body: "Team logins, reviews, follow-ups and a business app you can install on your phone." },
  { Svg: CreditCard, title: "Payments into your own account", body: "On a paid plan, connect your own payment gateway. Calvy never holds your money." },
  { Svg: Gift, title: "Rewards for loyal customers", body: "Customers who keep coming back earn rewards, and there is more on the way." },
];

export default function AboutPage() {
  return (
    <PageShell>
      <PageHero
        title="Bookings for small service businesses, made simple"
        intro="Calvy gives small service businesses a website and an online booking page they can set up in minutes, without a developer."
        visual={<Phone name="booking" alt="A Calvy booking page on a phone" priority className="max-w-[280px]" />}
      >
        <div className="mt-9 flex flex-wrap gap-3">
          <PrimaryLink href="/signup">Start free</PrimaryLink>
          <OutlineLink href="/contact">Talk to us</OutlineLink>
        </div>
      </PageHero>

      <Section tone="card">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div>
            <Heading title="Putting the phone-and-WhatsApp diary online" />
            <p className="-mt-6 text-lg leading-relaxed text-cv-mute">Clinics, salons, law practices, fitness studios and solo consultants still take many bookings by phone and WhatsApp. Calvy puts that online: a website with your services, team and hours, and a booking page where customers pick a time slot or take a token, any time of day.</p>
          </div>
          <Browser name="dashboard" alt="The Calvy dashboard with today's appointments" />
        </div>
      </Section>

      <Section tone="paper">
        <Heading title="Everything in one place" />
        <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {WHAT_YOU_GET.map(({ Svg, title, body }) => (
            <li key={title} className={`${card} p-6`}>
              <Icon Svg={Svg} />
              <h3 className="mt-4 mb-2 font-display font-bold text-lg text-cv-ink">{title}</h3>
              <p className="m-0 leading-relaxed text-cv-mute">{body}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section tone="card">
        <div className="grid items-start gap-10 md:grid-cols-2">
          <div>
            <Heading title="Simple plans, real people" />
            <p className="-mt-6 leading-relaxed text-cv-mute">The free plan has no monthly fee. Paid plans add more staff, WhatsApp messages and extra tools, and you can see current prices on the <Link href="/pricing" className="text-cv-blue underline underline-offset-4">pricing page</Link>. We read and answer every message sent to our <Link href="/contact" className="text-cv-blue underline underline-offset-4">contact address</Link>.</p>
          </div>
          <div className={`${card} p-6`}>
            <p className="m-0 text-sm font-semibold text-cv-ink">Built for</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {FOR_PAGES.map((p) => (
                <Link key={p.slug} href={`/for/${p.slug}`} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-cv-line px-4 text-sm font-semibold text-cv-ink transition-colors hover:border-cv-blue hover:text-cv-blue">
                  {p.what.charAt(0).toUpperCase() + p.what.slice(1)} <ArrowRight size={13} aria-hidden />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </Section>

      <CtaBand title="Ready to take bookings online?" text="Start free and have your website and booking link ready in minutes." />
    </PageShell>
  );
}
