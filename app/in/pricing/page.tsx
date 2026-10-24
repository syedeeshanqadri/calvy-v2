import type { Metadata } from "next";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import PricingClient from "@/components/landing/PricingClient";

export const metadata: Metadata = {
  title: "Pricing in India (₹) · Calvy",
  description: "Calvy pricing in rupees: free forever with ₹10 per confirmed online booking, Pro from ₹299/month and Business from ₹699/month. No per-staff fees.",
  alternates: {
    canonical: "/in/pricing",
    languages: { "x-default": "/pricing", en: "/pricing", "en-IN": "/in/pricing" },
  },
};

export default function IndiaPricingPage() {
  return (
    <main>
      <Navbar />
      <div className="pt-16">
        <PricingClient defaultRegion="IN" fixedRegion headingLevel="h1" />
      </div>
      <Footer />
    </main>
  );
}
