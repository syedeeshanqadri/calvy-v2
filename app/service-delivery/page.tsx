import Link from "next/link";
import type { Metadata } from "next";
import { LegalLayout } from "@/components/legal/LegalLayout";
import { SUPPORT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Service Delivery Policy · Calvy",
  description: "Calvy is a digital service delivered instantly online. Nothing is shipped. Read how access starts and what to do if something does not work.",
  alternates: { canonical: "/service-delivery" },
};

export default function ServiceDeliveryPage() {
  return (
    <LegalLayout
      title="Service Delivery Policy"
      lastUpdated="November 16, 2026"
      intro="Calvy is a digital service. There is nothing to ship and no delivery charge."
    >
      <h2>Instant access</h2>
      <p>Your account, website and booking page are ready as soon as you finish signing up. A paid plan is switched on as soon as the payment is confirmed by our payment partner, which is usually within a few minutes.</p>

      <h2>Where the service is delivered</h2>
      <p>You use Calvy in your web browser and, if you wish, as an app installed on your phone&apos;s home screen. Confirmations, reminders and receipts reach you and your customers by email, WhatsApp or push notification.</p>

      <h2>Bookings made through Calvy</h2>
      <p>An appointment booked through a business&apos;s Calvy page is a service provided by that business at the time and place it confirms. Calvy delivers the booking tools, not the appointment itself.</p>

      <h2>If something does not work</h2>
      <p>If you paid and your plan did not start, or a booking confirmation did not arrive, write to <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> with the details. Refunds are explained in the <Link href="/refund-policy">Refund &amp; Cancellation Policy</Link>.</p>
    </LegalLayout>
  );
}
