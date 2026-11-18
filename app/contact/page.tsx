import Link from "next/link";
import type { Metadata } from "next";
import { ArrowUpRight, LifeBuoy, Mail, Phone, Users } from "lucide-react";
import { PageShell, PageHero, CtaBand } from "@/components/marketing/PageShell";
import { Heading, Icon, Section, card } from "@/components/marketing/ui";
import { CONTACT, SUPPORT_EMAIL, TEAM_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact Calvy · Support and Phone",
  description: "Contact Calvy by email or phone. Support for booking pages, websites, payments and refunds.",
  alternates: { canonical: "/contact" },
};

const CARDS = [
  { Svg: Mail, title: "Support", note: "Account, booking page, payments or refunds. Email is the fastest way.", label: SUPPORT_EMAIL, href: `mailto:${SUPPORT_EMAIL}` },
  { Svg: Phone, title: "Phone", note: "Prefer to talk? Call us.", label: CONTACT.phone, href: CONTACT.phoneHref },
  { Svg: Users, title: "Team and partnerships", note: "Working together, press or partnerships.", label: TEAM_EMAIL, href: `mailto:${TEAM_EMAIL}` },
];

export default function ContactPage() {
  return (
    <PageShell>
      <PageHero title="We are here to help" intro="Write to us about your account, your booking page, payments or refunds. Email is the fastest way to reach us." />

      <section className="bg-cv-paper pb-16 sm:pb-24">
        <div className="mx-auto grid max-w-6xl gap-5 px-4 sm:px-6 md:grid-cols-3 lg:px-8">
          {CARDS.map(({ Svg, title, note, label, href }) => (
            <a key={title} href={href} className={`group ${card} p-8 transition-colors hover:border-cv-blue`}>
              <Icon Svg={Svg} size={24} />
              <h2 className="mt-6 font-display font-bold text-xl text-cv-ink">{title}</h2>
              <p className="mt-2 text-cv-mute leading-relaxed">{note}</p>
              <p className="mt-5 inline-flex items-center gap-1.5 break-all font-semibold text-cv-blue">{label} <ArrowUpRight size={16} className="shrink-0" aria-hidden /></p>
            </a>
          ))}
        </div>
      </section>

      <Section tone="card">
        <Heading title="A quick checklist gets you a faster answer" />
        <div className="grid gap-5 md:grid-cols-2">
          <div className={`${card} p-7`}>
            <h3 className="font-display font-bold text-lg text-cv-ink">Booked with a business?</h3>
            <p className="mt-2 mb-0 text-cv-mute leading-relaxed">For a refund on a booking, please contact the business you booked with first.</p>
          </div>
          <div className={`${card} p-7`}>
            <h3 className="font-display font-bold text-lg text-cv-ink">Writing about your account?</h3>
            <p className="mt-2 mb-0 text-cv-mute leading-relaxed">Include your business name and the email address on your account, and we will reply as soon as we can.</p>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-cv-mute">
          <Link href="/help" className="inline-flex items-center gap-1.5 font-semibold text-cv-blue hover:underline"><LifeBuoy size={15} aria-hidden /> Help Center</Link>
          <Link href="/refund-policy" className="font-semibold text-cv-blue hover:underline">Refund &amp; Cancellation Policy</Link>
          <span>Calvy is operated by <strong className="text-cv-ink">{CONTACT.legalName}</strong>.</span>
        </div>
      </Section>

      <CtaBand title="Not a Calvy business yet?" text="Start free and have your website and booking link ready in minutes." />
    </PageShell>
  );
}
