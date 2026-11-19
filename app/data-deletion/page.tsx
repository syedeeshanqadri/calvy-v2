import Link from "next/link";
import type { Metadata } from "next";
import { LegalLayout } from "@/components/legal/LegalLayout";
import { SUPPORT_EMAIL } from "@/lib/site";
import { DeletionForm } from "./DeletionForm";

export const metadata: Metadata = {
  title: "User Data Deletion · Calvy",
  description: "How to ask Calvy to delete your account and personal data, including data connected through Facebook or WhatsApp.",
  alternates: { canonical: "/data-deletion" },
};

export default function DataDeletionPage() {
  return (
    <LegalLayout
      title="User Data Deletion"
      lastUpdated="November 18, 2026"
      intro="You can ask us to delete your Calvy account and the personal data we hold about you at any time. This page explains how."
    >
      <h2>How to request deletion</h2>
      <p>Use the form below, or email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> from the email address on your Calvy account with the subject &quot;Delete my data&quot;. Tell us whether you are a business owner, a team member or a customer who booked through a business page. We may ask you to confirm it is really you before we act. We reply to confirm the request and tell you when the deletion is done.</p>
      <DeletionForm />

      <h2>What we delete</h2>
      <ul>
        <li>Your account, profile and sign-in details.</li>
        <li>For a business account: your business profile, website and booking page, services, staff, clients, appointments and uploaded files.</li>
        <li>Your WhatsApp connection, including the access tokens and registration PIN we store (encrypted), and message templates we installed on your account.</li>
        <li>Your notification and push settings.</li>
      </ul>

      <h2>What we may keep</h2>
      <p>Where the law requires it, we keep limited records, for example payment and invoice records needed for tax and accounting, and security logs needed to prevent abuse. These are kept only for as long as required and are not used for anything else.</p>

      <h2>If you connected Facebook or WhatsApp</h2>
      <p>You can disconnect at any time yourself: in Calvy go to Settings &gt; WhatsApp and press Disconnect. That removes Calvy from your WhatsApp Business Account and deletes the access tokens we hold. You can also remove Calvy in your Facebook settings under Business Integrations. Disconnecting does not delete your Calvy account; to delete that too, send the email above.</p>

      <h2>If you booked as a customer</h2>
      <p>If you have a customer account, you can request its deletion from your account page (you cannot while you have upcoming bookings). We wait 30 days, during which you can cancel, and then anonymise it: your name, email, phone number and sign-in details are removed, and the businesses keep their own booking records without your details. Your booking details are shared with the business you booked with, and that business is responsible for how it uses them. You can also email us and we will delete the details we hold for you, and pass your request on to the business where we can. To stop WhatsApp or email messages without deleting anything, reply STOP to a WhatsApp message or use the unsubscribe link in an email.</p>

      <p>More about how we handle data is in our <Link href="/privacy">Privacy Policy</Link>.</p>
    </LegalLayout>
  );
}
