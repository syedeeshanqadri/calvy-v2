import Link from "next/link";
import { CONTACT, SUPPORT_EMAIL } from "@/lib/site";
import type { Metadata } from "next";
import { LegalLayout } from "@/components/legal/LegalLayout";

export const metadata: Metadata = {
  title: "Terms & Conditions · Calvy",
  description: "The terms and conditions governing your use of Calvy.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <LegalLayout
      title="Terms & Conditions"
      lastUpdated="November 18, 2026"
      intro="These Terms & Conditions (“Terms”) govern your access to and use of Calvy (the “Service”), operated by {CONTACT.legalName} (“Calvy”, “we”, “us”). By creating an account or using the Service, you agree to be bound by these Terms. If you do not agree, do not use the Service."
    >
      <h2>1. Eligibility &amp; Accounts</h2>
      <p>You must be at least 18 years old and capable of forming a binding contract to use the Service. You are responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account.</p>

      <h2>2. Description of Service</h2>
      <p>Calvy provides an online appointment booking and business management platform that lets businesses publish a booking page, manage appointments, staff, and clients, accept payments, and send notifications. We may add, modify, or remove features at any time.</p>

      <h2>3. Subscriptions &amp; Billing</h2>
      <ul>
        <li>Calvy subscriptions are billed by Calvy, in advance, on a recurring monthly or annual basis through our payment partner.</li>
        <li>Your subscription renews automatically until cancelled. You authorize us to charge the applicable fees to your selected payment method each billing cycle.</li>
        <li>You may cancel at any time. Access continues until the end of the current billing period.</li>
        <li><strong>Upgrades</strong> start immediately. We credit the unused part of your current period against the new plan, so you pay only the difference for the rest of that period (the credit is shown at checkout and on your invoice), and your new billing period starts from the upgrade.</li>
        <li>We do not refund partial billing periods unless the law requires it. See the <Link href="/refund-policy">Refund &amp; Cancellation Policy</Link>.</li>
        <li>Fees are exclusive of taxes unless stated otherwise. You are responsible for any applicable taxes.</li>
      </ul>

      <h2>4. Payments to Businesses</h2>
      <p>Service fees are paid by a customer to the business, either at the venue or online directly to the business through the business&apos;s own payment gateway. <strong>Calvy does not collect or hold service fees.</strong> The business is solely responsible for the goods or services it provides, for honoring bookings, and for refunding its customers, through its gateway or in person, according to its own policy. Calvy is not a party to transactions between businesses and their customers.</p>

      <h2>5. Booking Confirmation Fee</h2>
      <ul>
        <li>On the Free plan in India, a customer pays a ₹10 booking confirmation fee when booking online. The fee is paid to Calvy and is non-refundable.</li>
        <li>If the booking is cancelled or not attended, the fee is not refunded, but the confirmation stays valid for one rebooking with the same business without paying the fee again.</li>
        <li>Businesses on higher plans connect their own payment gateway and the ₹10 fee does not apply.</li>
        <li>WhatsApp messages sent through a paid plan are charged by Meta to the business&apos;s own WhatsApp Business account.</li>
        <li>The Service is delivered digitally and is available as soon as your account is created. See <Link href="/service-delivery">Service Delivery</Link>.</li>
      </ul>

      <h2>6. Acceptable Use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Use the Service for any unlawful, fraudulent, or harmful purpose;</li>
        <li>Upload content that is illegal, infringing, or offensive;</li>
        <li>Attempt to gain unauthorized access to the Service or disrupt its operation;</li>
        <li>Resell or misrepresent the Service without our written permission.</li>
      </ul>

      <h2>7. Intellectual Property</h2>
      <p>The Service, including its software, design, and branding, is owned by Calvy and protected by intellectual property laws. You retain ownership of the content and data you submit, and grant us a limited license to use it solely to operate and provide the Service.</p>

      <h2>8. Termination</h2>
      <p>We may suspend or terminate your access if you breach these Terms or use the Service in a manner that may cause harm or legal liability. You may stop using the Service and delete your account at any time.</p>

      <h2>9. Disclaimers</h2>
      <p>The Service is provided “as is” and “as available” without warranties of any kind, express or implied. We do not warrant that the Service will be uninterrupted, error-free, or secure.</p>

      <h2>10. Limitation of Liability</h2>
      <p>To the maximum extent permitted by law, Calvy shall not be liable for any indirect, incidental, special, or consequential damages, or for loss of profits or data, arising from your use of the Service. Our total liability shall not exceed the amount you paid us in the twelve months preceding the claim.</p>

      <h2>11. Changes to These Terms</h2>
      <p>We may update these Terms from time to time. Continued use of the Service after changes take effect constitutes acceptance of the revised Terms.</p>

      <h2>12. Governing Law</h2>
      <p>These Terms are governed by the laws of India, without regard to conflict-of-law principles. Disputes shall be subject to the exclusive jurisdiction of the courts located in India.</p>

      <h2>13. Privacy</h2>
      <p>How we handle personal data is described in our <Link href="/privacy">Privacy Policy</Link>, which forms part of these Terms.</p>

      <h2>14. Contact Us</h2>
      <p>Questions about these Terms? Contact us at <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p>
    </LegalLayout>
  );
}
