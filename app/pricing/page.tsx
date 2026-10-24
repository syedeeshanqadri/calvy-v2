import type { Metadata } from "next";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import PricingClient from "@/components/landing/PricingClient";

export const metadata: Metadata = {
  title: "Pricing · Calvy",
  description: "Calvy pricing: a free forever plan, Pro from $5/month and Business from $12/month. Flat price for your whole team, no per-staff fees.",
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
