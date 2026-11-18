import type { Metadata } from "next";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import PricingClient from "@/components/landing/PricingClient";
import { REGION_PRICING, formatMoney } from "@/lib/pricing";
import { SITE_URL } from "@/lib/site";
import { jsonLdString } from "@/lib/jsonLd";

const intl = REGION_PRICING.INTL;
const [, pro, business] = intl.plans;

export const metadata: Metadata = {
  title: "Pricing: Free Booking Page and Website, Paid Plans from " + formatMoney(pro.yearlyPerMonth, intl) + "/month · Calvy",
  description: `Calvy pricing: a free plan, Pro from ${formatMoney(pro.yearlyPerMonth, intl)}/month and Business from ${formatMoney(business.yearlyPerMonth, intl)}/month billed yearly. Flat price for your whole team, no per-staff fees. WhatsApp message charges are billed by Meta.`,
  openGraph: { title: "Calvy pricing", description: "A free plan, plus Pro and Business for growing teams. Flat price, no per-staff fees.", url: "/pricing", type: "website" },
  alternates: {
    canonical: "/pricing",
    languages: { "x-default": "/pricing", en: "/pricing", "en-IN": "/in/pricing" },
  },
};

// Server-rendered as International; the visitor's region (cookie or detection) is applied on the client.
const pricingJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Calvy",
  url: SITE_URL,
  applicationCategory: "BusinessApplication",
  offers: intl.plans.map((p) => ({
    "@type": "Offer",
    name: p.name,
    price: String(p.monthly),
    priceCurrency: intl.currency,
    url: `${SITE_URL}/pricing`,
    description: p.description,
  })),
};

export default function PricingPage() {
  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(pricingJsonLd) }} />
      <Navbar />
      <div className="pt-16">
        <PricingClient headingLevel="h1" />
      </div>
      <Footer />
    </main>
  );
}
