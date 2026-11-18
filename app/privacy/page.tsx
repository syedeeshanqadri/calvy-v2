import Link from "next/link";
import { CONTACT, SUPPORT_EMAIL } from "@/lib/site";
import type { Metadata } from "next";
import { LegalLayout } from "@/components/legal/LegalLayout";

export const metadata: Metadata = {
  title: "Privacy Policy · Calvy",
  description: "How Calvy collects, uses, shares and protects personal information, and the service providers that process it: payment gateways, Meta WhatsApp, Google sign-in, Resend and our hosting partners.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPolicyPage() {
  return (
    <LegalLayout
      title="Privacy Policy"
      lastUpdated="November 18, 2026"
      intro="This Privacy Policy explains how Calvy (“we”, “us”, “our”) collects, uses, discloses, and safeguards your information when you use our appointment booking platform at calvy.io and related services (the “Service”). By using the Service, you agree to the practices described here."
    >
      <h2>1. Information We Collect</h2>
      <p>We collect the following categories of information:</p>
      <ul>
        <li><strong>Account information</strong> — name, email address, phone number, business name, and password when you register.</li>
        <li><strong>Business and booking data</strong> — services, staff, working hours, appointments, and client records you add to manage your bookings.</li>
        <li><strong>Client information</strong> — when your customers book through your page, we collect their name, email, phone number, and appointment details on your behalf.</li>
        <li><strong>Payment information</strong> — online payments are processed by payment gateways, not by us: Cashfree for the booking confirmation fee and for Calvy plan payments, and the business&apos;s own gateway for service payments (see section 3). We do not store full card numbers, UPI PINs, PayPal logins or banking credentials on our servers; we keep the order, amount and status of each payment, and the invoices we issue for Calvy plans.</li>
        <li><strong>Sign-in information</strong> — if you choose to sign in with Google, we receive your name, email address and profile picture from Google. We never receive your Google password.</li>
        <li><strong>Notification data</strong> — if you turn on phone alerts, your browser or phone gives us a push subscription address for that device. If you give a phone number for WhatsApp, we use it only to send booking messages.</li>
        <li><strong>Usage and device data</strong> — IP address, browser type, pages visited, and similar diagnostic data collected automatically.</li>
      </ul>

      <h2>2. How We Use Your Information</h2>
      <p>We use the information we collect to:</p>
      <ul>
        <li>Provide, operate, and maintain the Service;</li>
        <li>Process bookings and payments and send confirmations and reminders by email, WhatsApp, or push notification;</li>
        <li>Manage your subscription and billing;</li>
        <li>Offer rewards to customers who book often: to do this we may keep a count of attended visits linked to your email address or phone number, across the businesses on Calvy;</li>
        <li>Respond to support requests and communicate service updates;</li>
        <li>Detect, prevent, and address fraud, abuse, or security issues;</li>
        <li>Comply with legal obligations.</li>
      </ul>

      <h2>3. Sharing of Information and Service Providers</h2>
      <p>We do not sell your personal information. We share data only with the providers below, which process it for us to run the Service, with the business you book with, and with legal authorities where required.</p>
      <ul>
        <li><strong>Cashfree</strong> — processes the booking confirmation fee and Calvy plan payments (including recurring plan charges) and their refunds. It receives the payer&apos;s name, email, phone number and the amount.</li>
        <li><strong>The business&apos;s own payment gateway</strong> — a business on a paid plan connects its own account with one of these providers, which then processes the customer&apos;s payment for that business&apos;s services: Razorpay, Cashfree, PhonePe, PayU, CCAvenue and Paytm in India, and Stripe and PayPal outside India, with more added over time. The business connects these accounts itself in its Calvy settings (or we integrate them for the business at its request). The payer&apos;s name, email, phone number and the amount are sent to that provider, which is responsible for the payment under its own terms and privacy policy. Calvy does not receive or hold the money, and keeps only the order reference, amount and status. A business&apos;s gateway keys are stored encrypted and are never shown again.</li>
        <li><strong>Meta (WhatsApp Business Platform)</strong> — delivers WhatsApp booking confirmations and reminders. It receives the recipient&apos;s phone number and the message text. Message charges on paid plans are billed by Meta to the business&apos;s own WhatsApp Business account.</li>
        <li><strong>Google</strong> — provides the optional &ldquo;Sign in with Google&rdquo; and, if a business adds one, the Google review link and map shown on its website.</li>
        <li><strong>Resend</strong> — sends our email (verification, confirmations, reminders, receipts).</li>
        <li><strong>Vercel and Neon</strong> — host the application and its database.</li>
        <li><strong>Push services of your browser or phone maker</strong> — deliver phone alerts you have turned on.</li>
        <li><strong>The business you book with</strong> — if you book as a client, your booking details are shared with that business, which is responsible for how it uses them.</li>
        <li><strong>Legal authorities</strong> where required by law or to protect our rights.</li>
      </ul>

      <h2>4. Data Retention</h2>
      <p>We retain your information for as long as your account is active or as needed to provide the Service. You may request deletion of your account and associated data at any time, subject to legal record-keeping obligations.</p>

      <h2>5. Security</h2>
      <p>We use industry-standard technical and organizational measures to protect your data, including encryption in transit and access controls. However, no method of transmission or storage is completely secure, and we cannot guarantee absolute security.</p>

      <h2>6. Your Rights</h2>
      <p>Depending on your jurisdiction, you may have the right to access, correct, export, or delete your personal data, and to object to or restrict certain processing. To exercise these rights, contact us at the address below. You can also ask to stop WhatsApp or email messages at any time.</p>

      <h2>7. Cookies</h2>
      <p>We use cookies and similar technologies to keep you signed in, remember preferences, and analyze usage. You can control cookies through your browser settings, though some features may not function without them.</p>

      <h2>8. Where Data Is Processed</h2>
      <p>Our providers may process data in countries other than your own. We choose providers that protect data with appropriate safeguards.</p>

      <h2>9. Children&apos;s Privacy</h2>
      <p>The Service is not directed to children under 16, and we do not knowingly collect personal information from them.</p>

      <h2>10. Changes to This Policy</h2>
      <p>We may update this Privacy Policy from time to time. We will revise the “Last updated” date above and, where appropriate, notify you of material changes.</p>

      <h2>11. Contact Us</h2>
      <p>If you have questions about this Privacy Policy, contact us at <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> or on <a href={CONTACT.phoneHref}>{CONTACT.phone}</a>, or through the <Link href="/contact">Contact page</Link>.</p>
    </LegalLayout>
  );
}
