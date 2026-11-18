import Link from "next/link";
import type { Metadata } from "next";
import { ArrowUpRight, LifeBuoy, Mail, Phone, Users } from "lucide-react";
import { PageShell, PageHero, SectionHead, CtaBand } from "@/components/marketing/PageShell";
import { CONTACT, SUPPORT_EMAIL, TEAM_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact Calvy · Support and Phone",
  description: "Contact Calvy by email or phone. Support for booking pages, websites, payments and refunds.",
  alternates: { canonical: "/contact" },
};

const CARDS = [
  { Icon: Mail, title: "Support", note: "Account, booking page, payments or refunds. Email is the fastest way.", label: SUPPORT_EMAIL, href: `mailto:${SUPPORT_EMAIL}` },
  { Icon: Phone, title: "Phone", note: "Prefer to talk? Call us.", label: CONTACT.phone, href: CONTACT.phoneHref },
  { Icon: Users, title: "Team and partnerships", note: "Working together, press or partnerships.", label: TEAM_EMAIL, href: `mailto:${TEAM_EMAIL}` },
];

export default function ContactPage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="Contact us"
        title="We are here to help"
        intro="Write to us about your account, your booking page, payments or refunds. Email is the fastest way to reach us."
      />

      <section className="pb-16 sm:pb-24 bg-white pt-2">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 grid md:grid-cols-3 gap-5">
          {CARDS.map(({ Icon, title, note, label, href }) => (
            <a key={title} href={href} className="group rounded-3xl border border-gray-100 bg-white p-8 shadow-sm hover:shadow-xl hover:-translate-y-1 hover:border-sky-200 transition-all">
              <span className="w-12 h-12 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center"><Icon size={22} aria-hidden /></span>
              <h2 className="mt-6 font-syne font-bold text-xl text-gray-900">{title}</h2>
              <p className="mt-2 text-gray-600 leading-relaxed">{note}</p>
              <p className="mt-5 inline-flex items-center gap-1.5 font-semibold text-sky-700 break-all">{label} <ArrowUpRight size={16} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform shrink-0" aria-hidden /></p>
            </a>
          ))}
        </div>
      </section>

      <section className="py-16 sm:py-20 bg-gray-50 border-y border-gray-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHead eyebrow="Before you write" title="A quick checklist gets you a faster answer" />
          <div className="mt-10 grid md:grid-cols-2 gap-5">
            <div className="rounded-2xl bg-white border border-gray-100 p-7">
              <h3 className="font-syne font-bold text-lg text-gray-900">Booked with a business?</h3>
              <p className="mt-2 text-gray-600 leading-relaxed">For a refund on a booking, please contact the business you booked with first.</p>
            </div>
            <div className="rounded-2xl bg-white border border-gray-100 p-7">
              <h3 className="font-syne font-bold text-lg text-gray-900">Writing about your account?</h3>
              <p className="mt-2 text-gray-600 leading-relaxed">Include your business name and the email address on your account, and we will reply as soon as we can.</p>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-gray-600">
            <Link href="/help" className="inline-flex items-center gap-1.5 font-semibold text-sky-700 hover:underline"><LifeBuoy size={15} aria-hidden /> Help Center</Link>
            <Link href="/refund-policy" className="font-semibold text-sky-700 hover:underline">Refund &amp; Cancellation Policy</Link>
            <span>Calvy is operated by <strong className="text-gray-900">{CONTACT.legalName}</strong>.</span>
          </div>
        </div>
      </section>

      <CtaBand title="Not a Calvy business yet?" text="Start free and have your website and booking link ready in minutes." />
    </PageShell>
  );
}
