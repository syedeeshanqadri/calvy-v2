import { Navbar } from "@/components/landing/Navbar";
import { Hero } from "@/components/landing/Hero";
import { StatsBar } from "@/components/landing/StatsBar";
import { ProblemStatement } from "@/components/landing/ProblemStatement";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { InlineCTABand } from "@/components/landing/InlineCTABand";
import { Features } from "@/components/landing/Features";
import { LeadMagnet } from "@/components/landing/LeadMagnet";
import { Testimonials } from "@/components/landing/Testimonials";
import { Pricing } from "@/components/landing/Pricing";
import { LeadCapture } from "@/components/landing/LeadCapture";
import { CTA } from "@/components/landing/CTA";
import { Footer } from "@/components/landing/Footer";
import { ExitIntentPopup } from "@/components/landing/ExitIntentPopup";
import { FloatingLeadCTA } from "@/components/landing/FloatingLeadCTA";
import { StickySidebarCTA } from "@/components/landing/StickySidebarCTA";
import type { Metadata } from "next";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://calvy.io";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
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
      description: "Smart appointment booking for salons, clinics, coaches, and every service business.",
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgWebsiteJsonLd) }} />
      <Navbar />
      <Hero />
      <StatsBar />
      <ProblemStatement />
      <HowItWorks />
      <InlineCTABand />
      <Features />
      <LeadMagnet />
      <Testimonials />
      <Pricing />
      <LeadCapture />
      <CTA />
      <Footer />

      {/* Overlay lead-gen forms */}
      <ExitIntentPopup />
      <FloatingLeadCTA />
      <StickySidebarCTA />
    </main>
  );
}
