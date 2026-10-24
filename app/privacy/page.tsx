import { SUPPORT_EMAIL } from "@/lib/site";
import type { Metadata } from "next";
import { LegalLayout } from "@/components/legal/LegalLayout";

export const metadata: Metadata = {
  title: "Privacy Policy · Calvy",
  description: "How Calvy collects, uses, and protects your personal information.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPolicyPage() {
  return (
    <LegalLayout
      title="Privacy Policy"
      lastUpdated="May 31, 2026"
      intro="This Privacy Policy explains how Calvy (“we”, “us”, “our”) collects, uses, discloses, and safeguards your information when you use our appointment booking platform at calvy.io and related services (the “Service”). By using the Service, you agree to the practices described here."
    >
      <h2>1. Information We Collect</h2>
      <p>We collect the following categories of information:</p>
      <ul>
        <li><strong>Account information</strong> — name, email address, phone number, business name, and password when you register.</li>
        <li><strong>Business and booking data</strong> — services, staff, working hours, appointments, and client records you add to manage your bookings.</li>
        <li><strong>Client information</strong> — when your customers book through your page, we collect their name, email, phone number, and appointment details on your behalf.</li>
        <li><strong>Payment information</strong> — payments are processed by our payment partner, Razorpay. We do not store full card numbers or banking credentials on our servers.</li>
        <li><strong>Usage and device data</strong> — IP address, browser type, pages visited, and similar diagnostic data collected automatically.</li>
      </ul>

      <h2>2. How We Use Your Information</h2>
      <p>We use the information we collect to:</p>
      <ul>
        <li>Provide, operate, and maintain the Service;</li>
        <li>Process bookings and payments and send confirmations and reminders by email, WhatsApp, or push notification;</li>
        <li>Manage your subscription and billing;</li>
        <li>Respond to support requests and communicate service updates;</li>
        <li>Detect, prevent, and address fraud, abuse, or security issues;</li>
        <li>Comply with legal obligations.</li>
      </ul>

      <h2>3. Sharing of Information</h2>
      <p>We do not sell your personal information. We share data only with:</p>
      <ul>
        <li><strong>Service providers</strong> such as Razorpay (payments), email and messaging providers, and cloud hosting partners, who process data on our behalf;</li>
        <li><strong>Business owners</strong> — if you book as a client, your booking details are shared with the relevant business;</li>
        <li><strong>Legal authorities</strong> where required by law or to protect our rights.</li>
      </ul>

      <h2>4. Data Retention</h2>
      <p>We retain your information for as long as your account is active or as needed to provide the Service. You may request deletion of your account and associated data at any time, subject to legal record-keeping obligations.</p>

      <h2>5. Security</h2>
      <p>We use industry-standard technical and organizational measures to protect your data, including encryption in transit and access controls. However, no method of transmission or storage is completely secure, and we cannot guarantee absolute security.</p>

      <h2>6. Your Rights</h2>
      <p>Depending on your jurisdiction, you may have the right to access, correct, export, or delete your personal data, and to object to or restrict certain processing. To exercise these rights, contact us at the address below.</p>

      <h2>7. Cookies</h2>
      <p>We use cookies and similar technologies to keep you signed in, remember preferences, and analyze usage. You can control cookies through your browser settings, though some features may not function without them.</p>

      <h2>8. Children&apos;s Privacy</h2>
      <p>The Service is not directed to children under 16, and we do not knowingly collect personal information from them.</p>

      <h2>9. Changes to This Policy</h2>
      <p>We may update this Privacy Policy from time to time. We will revise the “Last updated” date above and, where appropriate, notify you of material changes.</p>

      <h2>10. Contact Us</h2>
      <p>If you have questions about this Privacy Policy, contact us at <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p>
    </LegalLayout>
  );
}
