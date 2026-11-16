import type { Metadata } from "next";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import PricingClient from "@/components/landing/PricingClient";
import { REGION_PRICING, formatMoney } from "@/lib/pricing";

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
export default function PricingPage() {
  return (
    <main>
      <Navbar />
      <div className="pt-16">
        <PricingClient headingLevel="h1" />
      </div>
      <Footer />
    </main>
  );
}
