import type { Metadata } from "next";
import { LegalLayout } from "@/components/legal/LegalLayout";

export const metadata: Metadata = {
  title: "Refund Policy · Calvy",
  description: "Calvy's refund and cancellation policy for subscriptions and bookings.",
  alternates: { canonical: "/refund-policy" },
};

export default function RefundPolicyPage() {
  return (
    <LegalLayout
      title="Refund Policy"
      lastUpdated="May 31, 2026"
      intro="This Refund Policy explains how cancellations and refunds work for Calvy subscriptions, as well as for payments collected from clients through the platform."
    >
      <h2>1. Subscription Cancellations</h2>
      <p>You can cancel your Calvy subscription at any time from your billing dashboard. When you cancel:</p>
      <ul>
        <li>Your plan remains active until the end of the current billing period;</li>
        <li>You will not be charged again after cancellation;</li>
        <li>Your account is downgraded to the free plan once the paid period ends.</li>
      </ul>

      <h2>2. Subscription Refunds</h2>
      <p>Subscription fees are billed in advance and are generally non-refundable, including for partially used billing periods. We may, at our sole discretion, issue a refund in the following cases:</p>
      <ul>
        <li>A duplicate or accidental charge;</li>
        <li>A verified technical issue on our side that prevented you from using the Service for a significant period;</li>
        <li>A charge made after a valid cancellation request.</li>
      </ul>
      <p>Approved refunds are credited to the original payment method via Razorpay within 5–10 business days, depending on your bank or card issuer.</p>

      <h2>3. Annual Plans</h2>
      <p>Annual plans are offered at a discount in exchange for an upfront yearly commitment and are non-refundable after the first 7 days from the date of purchase. Within the first 7 days, you may request a full refund of an annual plan if you have not substantially used the Service.</p>

      <h2>4. Payments Between Businesses and Their Clients</h2>
      <p>When a business uses Calvy to collect payment from its own clients (for example, prepaid bookings), the refund is the responsibility of that business, not Calvy. If you are a client seeking a refund for a booking, please contact the business you booked with directly. Calvy only provides the technology to facilitate these payments and is not a party to the transaction.</p>

      <h2>5. How to Request a Refund</h2>
      <p>To request a refund for your Calvy subscription, email <a href="mailto:support@calvy.io">support@calvy.io</a> from the email address associated with your account, including your business name and the date of the charge. We aim to respond to all refund requests within 3 business days.</p>

      <h2>6. Changes to This Policy</h2>
      <p>We may update this Refund Policy from time to time. The “Last updated” date above reflects the most recent revision.</p>

      <h2>7. Contact Us</h2>
      <p>For any questions about refunds or cancellations, reach us at <a href="mailto:support@calvy.io">support@calvy.io</a>.</p>
    </LegalLayout>
  );
}
