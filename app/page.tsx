import { SITE_URL, SUPPORT_EMAIL } from "@/lib/site";
import { jsonLdString } from "@/lib/jsonLd";
import { Navbar } from "@/components/landing/Navbar";
import { Hero } from "@/components/landing/Hero";
import { ProblemStatement } from "@/components/landing/ProblemStatement";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { InlineCTABand } from "@/components/landing/InlineCTABand";
import { Features } from "@/components/landing/Features";
import { LeadMagnet } from "@/components/landing/LeadMagnet";
import { BusinessTypes } from "@/components/landing/BusinessTypes";
import { BuiltForStrip } from "@/components/landing/BuiltForStrip";
import { TokenSpotlight } from "@/components/landing/TokenSpotlight";
import { Pricing } from "@/components/landing/Pricing";
import { LandingFaq } from "@/components/landing/LandingFaq";
import { LANDING_FAQ } from "@/lib/landingFaq";
import { LeadCapture } from "@/components/landing/LeadCapture";
import { CTA } from "@/components/landing/CTA";
import { Footer } from "@/components/landing/Footer";
import type { Metadata } from "next";

const APP_URL = SITE_URL;

export const metadata: Metadata = {
  title: { absolute: "Free Website & Online Booking Page for Clinics, Salons, Lawyers | Calvy" },
  description: "Build a free website and online booking page for your clinic, salon, law practice or consulting business. Time slots and tokens, WhatsApp, email and push alerts, team roles and online payments.",
  keywords: ["build a website", "build booking page", "online business", "clinic website", "lawyer website", "salon website", "online appointments", "online appointment booking", "token online", "token system for clinic", "salon booking", "slot booking", "appointment scheduling software"],
  alternates: { canonical: "/" },
  openGraph: { title: "Free Website & Online Booking Page | Calvy", description: "Build your website and booking page for free. Time slots, tokens, reminders and online payments.", url: "/", siteName: "Calvy", type: "website" },
};

const orgWebsiteJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${APP_URL}/#organization`,
      name: "Calvy",
      url: APP_URL,
      logo: { "@type": "ImageObject", url: `${APP_URL}/api/icon?size=512`, width: 512, height: 512 },
      description: "Free website and online booking page builder for clinics, salons, lawyers and every appointment-based business.",
      email: SUPPORT_EMAIL,
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${APP_URL}/#software`,
      name: "Calvy",
      url: APP_URL,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web, Android, iOS (installable web app)",
      description: "Build a website and online booking page with time slots and tokens, reminders on email, WhatsApp and push, team roles and online payments.",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD", description: "Free plan" },
      publisher: { "@id": `${APP_URL}/#organization` },
    },
    {
      "@type": "FAQPage",
      "@id": `${APP_URL}/#faq`,
      mainEntity: LANDING_FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    },
    {
      "@type": "WebSite",
      "@id": `${APP_URL}/#website`,
      url: APP_URL,
      name: "Calvy",
      publisher: { "@id": `${APP_URL}/#organization` },
      potentialAction: {
        "@type": "SearchAction",
        target: { "@type": "EntryPoint", urlTemplate: `${APP_URL}/help?q={search_term_string}` },
        "query-input": "required name=search_term_string",
      },
    },
  ],
};

export default function HomePage() {
  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(orgWebsiteJsonLd) }} />
      <Navbar />
      <noscript><style>{".mk-reveal{opacity:1!important;transform:none!important}"}</style></noscript>
      <Hero />
      <BuiltForStrip />
      <BusinessTypes />
      <ProblemStatement />
      <TokenSpotlight />
      <HowItWorks />
      <InlineCTABand />
      <Features />
      <LeadMagnet />
      <Pricing />
      <LandingFaq />
      <LeadCapture />
      <CTA />
      <Footer />

      {/* Paused 2026-10-27 (owner): the overlay lead-gen forms below pop up on their own to collect emails.
          Components are kept; mount them again to bring them back.
      <ExitIntentPopup />
      <FloatingLeadCTA />
      <StickySidebarCTA /> */}
    </main>
  );
}
