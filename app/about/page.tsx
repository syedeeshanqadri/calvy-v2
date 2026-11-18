import type { Metadata } from "next";
import Link from "next/link";
import { LegalLayout } from "@/components/legal/LegalLayout";

export const metadata: Metadata = {
  title: "About Calvy · Free Website and Booking Page for Service Businesses",
  description: "Calvy helps clinics, salons, lawyers, fitness studios and consultants build a free website and online booking page, with time slots, tokens, reminders and online payments.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <LegalLayout
      title="About Calvy"
      lastUpdated="November 18, 2026"
      intro="Calvy gives small service businesses a website and an online booking page they can set up in minutes, without a developer."
    >
      <h2>What we do</h2>
      <p>Clinics, salons, law practices, fitness studios and solo consultants still take many bookings by phone and WhatsApp. Calvy puts that online: a website with your services, team and hours, and a booking page where customers pick a time slot or take a token, any time of day.</p>

      <h2>What you get</h2>
      <ul>
        <li>A free website and booking page, with the wording of your own kind of business (patients and doctors for a clinic, clients and stylists for a salon);</li>
        <li>Time slots, token queues, or both;</li>
        <li>Confirmations and reminders by email, WhatsApp (paid plans) and push alerts on your phone;</li>
        <li>Team logins with roles, reviews, follow-ups and a business app you can install on your phone;</li>
        <li>Online payments straight into your own account: connect your own payment gateway (Razorpay, Cashfree, PhonePe, PayU, CCAvenue or Paytm in India, Stripe or PayPal elsewhere) on a paid plan. Calvy never holds your money;</li>
        <li>Rewards for customers who keep coming back, and lots more rewards on the way.</li>
      </ul>

      <h2>How we work</h2>
      <p>The free plan has no monthly fee. Paid plans add more staff, WhatsApp messages and extra tools, and you can see current prices on the <Link href="/pricing">pricing page</Link>. We read and answer every message sent to our <Link href="/contact">contact address</Link>.</p>

      <p><Link href="/signup">Start free</Link></p>
    </LegalLayout>
  );
}
