import Link from "next/link";
import type { Metadata } from "next";
import { LegalLayout } from "@/components/legal/LegalLayout";
import { CONTACT, SUPPORT_EMAIL, TEAM_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact Calvy · Support, Address and Phone",
  description: "Contact Calvy by email, phone or post. Support for booking pages, websites, payments and refunds.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <LegalLayout
      title="Contact Us"
      lastUpdated="November 18, 2026"
      intro="Write to us about your account, your booking page, payments or refunds. Email is the fastest way to reach us."
    >
      <h2>Support</h2>
      <p>Email: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></p>
      <p>Phone: <a href={CONTACT.phoneHref}>{CONTACT.phone}</a></p>
      <p>Team and partnerships: <a href={`mailto:${TEAM_EMAIL}`}>{TEAM_EMAIL}</a></p>

      <h2>Business details</h2>
      <p>Calvy is operated by <strong>{CONTACT.legalName}</strong>.</p>
      <p><strong>Registered address:</strong> {CONTACT.address}</p>

      <h2>Before you write</h2>
      <p>For a refund on a booking, please contact the business you booked with first. For everything else, include your business name and the email address on your account, and we will reply as soon as we can. See also the <Link href="/help">Help Center</Link> and the <Link href="/refund-policy">Refund &amp; Cancellation Policy</Link>.</p>
    </LegalLayout>
  );
}
