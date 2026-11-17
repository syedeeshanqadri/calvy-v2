import Link from "next/link";
import { CONTACT, SUPPORT_EMAIL } from "@/lib/site";
import type { Metadata } from "next";
import { LegalLayout } from "@/components/legal/LegalLayout";

export const metadata: Metadata = {
  title: "Refund & Cancellation Policy · Calvy",
  description: "Calvy refund and cancellation policy: the ₹10 booking confirmation fee, service fees and refunds by businesses, Calvy subscription cancellation and refunds.",
  alternates: { canonical: "/refund-policy" },
};

export default function RefundPolicyPage() {
  return (
    <LegalLayout
      title="Refund & Cancellation Policy"
      lastUpdated="November 16, 2026"
      intro={`This policy explains cancellations and refunds for the booking confirmation fee, for service fees paid to businesses, and for Calvy subscriptions. Calvy is operated by ${CONTACT.legalName}.`}
    >
      <h2>1. Booking Confirmation Fee (₹10)</h2>
      <p>On the Basic plan in India, a customer pays a ₹10 booking confirmation fee when booking online. The fee is paid to Calvy and is <strong>non-refundable</strong>.</p>
      <p>If the booking is cancelled, including a last-minute cancellation, or is not attended, the fee is not refunded. The confirmation stays valid: the customer can rebook <strong>once</strong> with the same business without paying the fee again.</p>
      <p>A fee charged twice, or taken without creating a booking, is refunded in full.</p>

      <h2>2. Service Fees</h2>
      <p>Service fees are paid at the venue, or online directly to the business through the business&apos;s own payment gateway. <strong>Calvy does not collect or hold service fees.</strong></p>

      <h2>3. Refunds of Service Fees</h2>
      <p>Refunds of service fees are handled by the business, through its payment gateway or in person, according to the business&apos;s own cancellation and refund policy. Calvy is not a party to the sale between a business and its customer. If you are a customer and want a refund, please contact the business you booked with.</p>

      <h2>4. Refund Timeline</h2>
      <p>A refund that Calvy approves (a subscription charge, or a confirmation fee charged in error) is returned to the original payment method through our payment partner and normally reaches you in <strong>5–7 working days</strong>, depending on your bank, card issuer or UPI app. The timing of a refund made by a business depends on that business and its payment gateway.</p>

      <h2>5. Calvy Subscriptions: Cancellation</h2>
      <p>Calvy subscriptions are billed by Calvy. You can cancel at any time. When you cancel:</p>
      <ul>
        <li>your access continues until the end of the current billing period;</li>
        <li>you will not be charged again after cancellation;</li>
        <li>your account moves to the free plan when the paid period ends, and nothing is deleted.</li>
      </ul>

      <h2>6. Calvy Subscriptions: Refunds</h2>
      <p>Subscription fees are billed in advance. We do not refund partial billing periods unless the law requires it. We will refund a subscription charge in these cases:</p>
      <ul>
        <li>a duplicate or accidental charge;</li>
        <li>a charge made after a valid cancellation request;</li>
        <li>a verified technical problem on our side that stopped you from using the Service for a significant time.</li>
      </ul>
      <p>Approved subscription refunds are returned to the original payment method within 5–7 working days.</p>

      <h2>7. How to Request a Refund</h2>
      <p>For a subscription refund, email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> from the email address on your account, with your business name and the date of the charge. We aim to reply within 3 working days. For a refund of a service fee, contact the business first; if you cannot reach it, write to us and we will help where we can.</p>

      <h2>8. Changes to This Policy</h2>
      <p>We may update this policy from time to time. The &ldquo;Last updated&rdquo; date above shows the latest revision.</p>

      <h2>9. Contact Us</h2>
      <p>Questions about refunds or cancellations? Write to <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>, call <a href={CONTACT.phoneHref}>{CONTACT.phone}</a> or use the <Link href="/contact">Contact page</Link>.</p>
    </LegalLayout>
  );
}
