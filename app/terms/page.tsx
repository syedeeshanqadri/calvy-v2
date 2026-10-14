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
      lastUpdated="May 31, 2026"
      intro="These Terms & Conditions (“Terms”) govern your access to and use of Calvy (the “Service”), operated by Calvy. By creating an account or using the Service, you agree to be bound by these Terms. If you do not agree, do not use the Service."
    >
      <h2>1. Eligibility &amp; Accounts</h2>
      <p>You must be at least 18 years old and capable of forming a binding contract to use the Service. You are responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account.</p>

      <h2>2. Description of Service</h2>
      <p>Calvy provides an online appointment booking and business management platform that lets businesses publish a booking page, manage appointments, staff, and clients, accept payments, and send notifications. We may add, modify, or remove features at any time.</p>

      <h2>3. Subscriptions &amp; Billing</h2>
      <ul>
        <li>Paid plans are billed in advance on a recurring monthly or annual basis through our payment partner, Razorpay.</li>
        <li>Your subscription renews automatically until cancelled. You authorize us to charge the applicable fees to your selected payment method each billing cycle.</li>
        <li>You may cancel at any time from your billing dashboard; access continues until the end of the current billing period.</li>
        <li>Fees are exclusive of taxes unless stated otherwise. You are responsible for any applicable taxes.</li>
      </ul>

      <h2>4. Payments to Businesses</h2>
      <p>Where you use the Service to collect payments from your own clients, you are solely responsible for the goods or services you provide, for honoring bookings, and for any refunds owed to your clients. Calvy is not a party to transactions between businesses and their clients.</p>

      <h2>5. Acceptable Use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Use the Service for any unlawful, fraudulent, or harmful purpose;</li>
        <li>Upload content that is illegal, infringing, or offensive;</li>
        <li>Attempt to gain unauthorized access to the Service or disrupt its operation;</li>
        <li>Resell or misrepresent the Service without our written permission.</li>
      </ul>

      <h2>6. Intellectual Property</h2>
      <p>The Service, including its software, design, and branding, is owned by Calvy and protected by intellectual property laws. You retain ownership of the content and data you submit, and grant us a limited license to use it solely to operate and provide the Service.</p>

      <h2>7. Termination</h2>
      <p>We may suspend or terminate your access if you breach these Terms or use the Service in a manner that may cause harm or legal liability. You may stop using the Service and delete your account at any time.</p>

      <h2>8. Disclaimers</h2>
      <p>The Service is provided “as is” and “as available” without warranties of any kind, express or implied. We do not warrant that the Service will be uninterrupted, error-free, or secure.</p>

      <h2>9. Limitation of Liability</h2>
      <p>To the maximum extent permitted by law, Calvy shall not be liable for any indirect, incidental, special, or consequential damages, or for loss of profits or data, arising from your use of the Service. Our total liability shall not exceed the amount you paid us in the twelve months preceding the claim.</p>

      <h2>10. Changes to These Terms</h2>
      <p>We may update these Terms from time to time. Continued use of the Service after changes take effect constitutes acceptance of the revised Terms.</p>

      <h2>11. Governing Law</h2>
      <p>These Terms are governed by the laws of India, without regard to conflict-of-law principles. Disputes shall be subject to the exclusive jurisdiction of the courts located in India.</p>

      <h2>12. Contact Us</h2>
      <p>Questions about these Terms? Contact us at <a href="mailto:support@calvy.io">support@calvy.io</a>.</p>
    </LegalLayout>
  );
}
