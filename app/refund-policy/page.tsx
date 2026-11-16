import Link from "next/link";
import { SUPPORT_EMAIL } from "@/lib/site";
import type { Metadata } from "next";
import { LegalLayout } from "@/components/legal/LegalLayout";

export const metadata: Metadata = {
  title: "Refund & Cancellation Policy · Calvy",
  description: "Calvy refund and cancellation policy: the ₹10 online booking fee, wallet credit for cancelled bookings, refunds issued by businesses, subscription refunds and the 5–7 working day timeline.",
  alternates: { canonical: "/refund-policy" },
};

export default function RefundPolicyPage() {
  return (
    <LegalLayout
      title="Refund & Cancellation Policy"
      lastUpdated="November 16, 2026"
      intro="This policy explains cancellations and refunds for Calvy subscriptions, for the platform fee on online bookings, and for payments that customers make to businesses through Calvy."
    >
      <h2>1. Platform Fee on Online Bookings</h2>
      <p>On the Free plan in India, each confirmed online booking carries a platform fee of ₹10, paid either by the business or by its customer, as the business chooses. The fee covers payment processing and the booking service. It is charged when the booking is confirmed and is not refunded if the booking is later cancelled or missed, except where the booking itself is refunded in full under section 4.</p>

      <h2>2. Cancelled and Missed Bookings: Wallet Credit</h2>
      <p>When a customer has paid online for a booking and the booking is cancelled, including a last-minute cancellation, or missed, the amount paid is not lost. It is kept as <strong>wallet credit</strong> for that customer with that business, and:</p>
      <ul>
        <li>the credit can be used to pay for a later booking with the same business;</li>
        <li>the credit does not expire;</li>
        <li>credit belongs to one customer and one business; it cannot be moved to another business or paid out as cash by Calvy.</li>
      </ul>

      <h2>3. Refunds Issued by Businesses</h2>
      <p>A business can choose to refund a customer instead of leaving the amount as credit. The business is responsible for deciding when to refund, according to its own cancellation rules. When a business starts a refund, the matching wallet credit is removed first, so a customer is never paid twice. Calvy is not a party to the sale between a business and its customer. If you are a customer and want a refund, please contact the business you booked with.</p>

      <h2>4. Refund Timeline</h2>
      <p>Once a refund is approved and started, it is sent back to the original payment method through our payment partner, Cashfree, and normally reaches you in <strong>5–7 working days</strong>, depending on your bank, card issuer or UPI app. A booking that was charged twice, or a payment that was taken but did not create a booking, is refunded in full.</p>

      <h2>5. Subscription Cancellations</h2>
      <p>You can cancel your Calvy subscription at any time from your billing dashboard. When you cancel:</p>
      <ul>
        <li>your plan stays active until the end of the current billing period;</li>
        <li>you will not be charged again after cancellation;</li>
        <li>your account moves to the free plan when the paid period ends, and nothing is deleted.</li>
      </ul>

      <h2>6. Subscription Refunds</h2>
      <p>Subscription fees are billed in advance and are generally non-refundable for the period already started. We will refund a subscription charge in these cases:</p>
      <ul>
        <li>a duplicate or accidental charge;</li>
        <li>a charge made after a valid cancellation request;</li>
        <li>a verified technical problem on our side that stopped you from using the Service for a significant time.</li>
      </ul>
      <p>For yearly plans, you may ask for a full refund within 7 days of purchase if you have not substantially used the Service. Approved subscription refunds are returned to the original payment method within 5–7 working days.</p>

      <h2>7. How to Request a Refund</h2>
      <p>For a subscription refund, email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> from the email address on your account, with your business name and the date of the charge. We aim to reply within 3 working days. For a booking refund, contact the business first; if you cannot reach it, write to us and we will help.</p>

      <h2>8. Changes to This Policy</h2>
      <p>We may update this policy from time to time. The &ldquo;Last updated&rdquo; date above shows the latest revision.</p>

      <h2>9. Contact Us</h2>
      <p>Questions about refunds or cancellations? Write to <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> or use the <Link href="/contact">Contact page</Link>.</p>
    </LegalLayout>
  );
}
