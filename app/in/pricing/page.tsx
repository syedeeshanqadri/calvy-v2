import type { Metadata } from "next";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import PricingClient from "@/components/landing/PricingClient";
import { REGION_PRICING, formatMoney } from "@/lib/pricing";
import { SITE_URL } from "@/lib/site";
import { jsonLdString } from "@/lib/jsonLd";

const india = REGION_PRICING.IN;
const [, pro, business] = india.plans;

export const metadata: Metadata = {
  title: "Pricing in India (₹) · Calvy",
  description: `Calvy pricing in rupees: free forever with ₹10 per confirmed online booking, Pro from ${formatMoney(pro.yearlyPerMonth, india)}/month and Business from ${formatMoney(business.yearlyPerMonth, india)}/month billed yearly. No per-staff fees. WhatsApp message charges are billed by Meta.`,
  openGraph: { title: "Calvy pricing in India (₹)", description: "Free forever with ₹10 per confirmed online booking. Pro and Business for growing teams.", url: "/in/pricing", type: "website" },
  alternates: {
    canonical: "/in/pricing",
    languages: { "x-default": "/pricing", en: "/pricing", "en-IN": "/in/pricing" },
  },
};

const pricingJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Calvy",
  url: SITE_URL,
  applicationCategory: "BusinessApplication",
  offers: india.plans.map((p) => ({
    "@type": "Offer",
    name: p.name,
    price: String(p.monthly),
    priceCurrency: india.currency,
    url: `${SITE_URL}/in/pricing`,
    description: p.description,
  })),
};

export default function IndiaPricingPage() {
  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(pricingJsonLd) }} />
      <Navbar />
      <div className="pt-16">
        <PricingClient defaultRegion="IN" fixedRegion headingLevel="h1" />
      </div>
      <Footer />
    </main>
  );
}
