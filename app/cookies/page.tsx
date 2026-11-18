import Link from "next/link";
import type { Metadata } from "next";
import { LegalLayout } from "@/components/legal/LegalLayout";
import { SUPPORT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Cookie Policy · Calvy",
  description: "Which cookies and similar storage Calvy uses, why, and how to control them.",
  alternates: { canonical: "/cookies" },
};

export default function CookiePolicyPage() {
  return (
    <LegalLayout
      title="Cookie Policy"
      lastUpdated="November 18, 2026"
      intro="Cookies are small files a website stores in your browser. This page lists the ones Calvy uses and why. We do not use cookies to show you ads."
    >
      <h2>What we use</h2>
      <ul>
        <li><strong>Sign-in cookies</strong> keep you logged in to your business dashboard or your customer account, and protect sign-in against forgery. Without them you cannot sign in.</li>
        <li><strong>Region cookie</strong> (<code>calvy_region</code>) remembers whether to show prices for India or for other countries, so the pricing page matches where you are.</li>
        <li><strong>Preference storage</strong> in your browser (local storage) remembers small choices, such as a dismissed notice or details you typed in a booking form so you do not have to type them again.</li>
        <li><strong>Phone app and alerts:</strong> if you install the business app or turn on phone alerts, your browser stores a service worker and a push subscription for that device. This happens only in the app and after you agree.</li>
        <li><strong>Security and diagnostics</strong> use your IP address and browser type to limit abuse and find errors.</li>
      </ul>

      <h2>What we do not do</h2>
      <p>We do not sell your data and we do not use advertising cookies. Payments are handled on the payment provider&apos;s own page, which may set its own cookies under its own policy.</p>

      <h2>Your choices</h2>
      <p>You can block or delete cookies in your browser settings. Sign-in will not work without the sign-in cookies. To turn off phone alerts, switch them off in Settings or in your browser&apos;s site settings.</p>

      <h2>More information</h2>
      <p>See our <Link href="/privacy">Privacy Policy</Link> for how we handle personal data. Questions? Write to <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p>
    </LegalLayout>
  );
}
